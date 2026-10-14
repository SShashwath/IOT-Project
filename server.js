require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));

const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!MONGODB_URI || !DEVICE_API_KEY || !ADMIN_API_KEY) {
  console.error(
    "Missing required environment variables: MONGODB_URI, DEVICE_API_KEY, ADMIN_API_KEY"
  );
  process.exit(1);
}

if (
  DEVICE_API_KEY.length < 32 ||
  ADMIN_API_KEY.length < 32 ||
  DEVICE_API_KEY === ADMIN_API_KEY
) {
  console.error(
    "Device and admin keys must be different, random secrets of at least 32 characters."
  );
  process.exit(1);
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireDeviceKey(req, res, next) {
  if (!safeEqual(req.get("x-device-key"), DEVICE_API_KEY)) {
    return res.status(401).json({ success: false, error: "Invalid device API key" });
  }
  next();
}

function requireAdminKey(req, res, next) {
  if (!safeEqual(req.get("x-admin-key"), ADMIN_API_KEY)) {
    return res.status(401).json({ success: false, error: "Invalid admin API key" });
  }
  next();
}

const itemSchema = new mongoose.Schema({
  uid: {
    type: String, required: true, unique: true, uppercase: true, trim: true, index: true
  },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: "", maxlength: 1000 },
  status: {
    type: String, enum: ["active", "lost", "found", "returned"], default: "active", index: true
  },
  lastSeenLocation: { type: String, default: null },
  lastSeenAt: { type: Date, default: null }
}, { timestamps: true });

const detectionSchema = new mongoose.Schema({
  uid: { type: String, required: true, uppercase: true, index: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },
  location: { type: String, required: true, maxlength: 100 },
  deviceId: { type: String, default: "campustrace-esp32" },
  scannedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

const Item = mongoose.model("Item", itemSchema);
const Detection = mongoose.model("Detection", detectionSchema);

const allowedLocations = new Set(["Central Library", "Cafeteria", "Main Block"]);

function normalizeUid(value) {
  return value.trim().replace(/[\s:-]/g, "").toUpperCase();
}

function isValidUid(uid) {
  return /^[0-9A-F]{8,20}$/.test(uid) && uid.length % 2 === 0;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "CampusTrace API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// Register an RFID-tagged item. Requires x-admin-key.
app.post("/api/items", requireAdminKey, asyncRoute(async (req, res) => {
  const { uid, name, category, description = "" } = req.body;

  if (
    typeof uid !== "string" || typeof name !== "string" ||
    typeof category !== "string" || typeof description !== "string"
  ) {
    return res.status(400).json({
      success: false, error: "uid, name and category must be strings"
    });
  }

  const normalizedUid = normalizeUid(uid);

  if (!isValidUid(normalizedUid)) {
    return res.status(400).json({ success: false, error: "Invalid RFID UID format" });
  }

  if (
    !name.trim() || name.trim().length > 120 ||
    !category.trim() || category.trim().length > 80 ||
    description.length > 1000
  ) {
    return res.status(400).json({
      success: false, error: "Invalid name, category or description"
    });
  }

  const item = await Item.create({
    uid: normalizedUid, name: name.trim(), category: category.trim(),
    description: description.trim()
  });

  res.status(201).json({ success: true, message: "RFID item registered", item });
}));

// Read-only item list.
app.get("/api/items", asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = {};

  if (
    typeof req.query.status === "string" &&
    ["active", "lost", "found", "returned"].includes(req.query.status)
  ) {
    filter.status = req.query.status;
  }

  const [items, total] = await Promise.all([
    Item.find(filter).select("-__v").sort({ updatedAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Item.countDocuments(filter)
  ]);

  res.json({
    success: true, items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}));

app.patch("/api/items/:id/status", requireAdminKey, asyncRoute(async (req, res) => {
  const { status } = req.body;

  if (!["active", "lost", "found", "returned"].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid item status" });
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, error: "Invalid item ID" });
  }

  const item = await Item.findByIdAndUpdate(
    req.params.id, { $set: { status } }, { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ success: false, error: "Item not found" });
  res.json({ success: true, item });
}));

// ESP32 endpoint: POST /api/iot/detection, header x-device-key.
app.post("/api/iot/detection", requireDeviceKey, asyncRoute(async (req, res) => {
  const { uid, location } = req.body;

  if (typeof uid !== "string" || typeof location !== "string") {
    return res.status(400).json({
      success: false, error: "uid and location are required strings"
    });
  }

  const normalizedUid = normalizeUid(uid);

  if (!isValidUid(normalizedUid)) {
    return res.status(400).json({ success: false, error: "Invalid RFID UID" });
  }

  if (!allowedLocations.has(location)) {
    return res.status(400).json({ success: false, error: "Unrecognized campus location" });
  }

  const item = await Item.findOne({ uid: normalizedUid });

  if (!item) {
    return res.status(404).json({
      success: false, error: "Unknown RFID tag. Register the item first."
    });
  }

  const scannedAt = new Date();
  const detection = await Detection.create({
    uid: normalizedUid, item: item._id, location, scannedAt
  });

  item.lastSeenLocation = location;
  item.lastSeenAt = scannedAt;
  await item.save();

  res.status(200).json({
    success: true,
    message: "Detection saved",
    detection: {
      id: detection._id, uid: detection.uid, itemName: item.name,
      location: detection.location, scannedAt: detection.scannedAt
    }
  });
}));

app.get("/api/iot/detections", asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const [detections, total] = await Promise.all([
    Detection.find().populate("item", "name category status").select("-__v")
      .sort({ scannedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Detection.countDocuments()
  ]);

  res.json({
    success: true, detections,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}));

app.get("/api/dashboard/summary", asyncRoute(async (req, res) => {
  const [totalItems, lostItems, returnedItems, totalScans, recentScans] =
    await Promise.all([
      Item.countDocuments(),
      Item.countDocuments({ status: "lost" }),
      Item.countDocuments({ status: "returned" }),
      Detection.countDocuments(),
      Detection.find().populate("item", "name category")
        .sort({ scannedAt: -1 }).limit(10).lean()
    ]);

  res.json({
    success: true,
    summary: { totalItems, lostItems, returnedItems, totalScans },
    recentScans
  });
}));

app.use((req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (err.code === 11000) {
    return res.status(409).json({
      success: false, error: "An item with this RFID UID already exists"
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, error: "Validation failed" });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false, error: "Invalid database identifier"
    });
  }

  res.status(500).json({ success: false, error: "Internal server error" });
});

async function start() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("MongoDB connected");

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CampusTrace API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Backend startup failed:", err.message);
  process.exit(1);
});
