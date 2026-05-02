const express = require("express");
const cors = require("cors");
const multer = require("multer");
const http = require("http");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const PDFDocument = require("pdfkit");
const mammoth = require("mammoth");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const htmlDocx = require("html-docx-js");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const os = require("os");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, param, query, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");

const app = express();
const httpServer = http.createServer(app);
const prisma = new PrismaClient();
const directTypingState = new Map();
const userSocketIds = new Map();
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "dev_access_secret_change_me";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "dev_refresh_secret_change_me";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 7;
const PASSWORD_SALT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_TIME_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const INITIAL_PASSWORD_TTL_DAYS = 3;
const MAX_LOCK_LEVEL = 4;
const RAW_CHAT_UPLOAD_MAX_MB = Number(process.env.CHAT_UPLOAD_MAX_MB || 50);
const CHAT_UPLOAD_MAX_MB = Number.isFinite(RAW_CHAT_UPLOAD_MAX_MB)
  ? Math.max(10, Math.min(500, Math.floor(RAW_CHAT_UPLOAD_MAX_MB)))
  : 50;
const CHAT_UPLOAD_MAX_BYTES = CHAT_UPLOAD_MAX_MB * 1024 * 1024;
const CHAT_STATUS = {
  AVAILABLE: "AVAILABLE",
  BUSY: "BUSY",
  AWAY: "AWAY",
  DND: "DND",
  INVISIBLE: "INVISIBLE",
};
const CHAT_STATUS_VALUES = new Set(Object.values(CHAT_STATUS));
let mailTransporter = null;

function publicApiOrigin(req) {
  const host = req.get("host") || "localhost:4000";
  const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const proto = typeof rawProto === "string" ? rawProto.split(",")[0].trim() : "http";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      const explicitAllowed = new Set(
        [process.env.ALLOWED_ORIGIN || "http://localhost:5173"].filter(Boolean)
      );
      const o = origin || "";
      const isLocalDevOrigin =
        /^http:\/\/localhost:\d+$/i.test(o) ||
        /^http:\/\/127\.0\.0\.1:\d+$/i.test(o);
      const isPrivateLanHttpOrigin =
        /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/i.test(o) ||
        /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/i.test(o) ||
        /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:\d+$/i.test(o);
      if (!origin || explicitAllowed.has(origin) || isLocalDevOrigin || isPrivateLanHttpOrigin) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked for this origin"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-User"],
  })
);
app.use(express.json({ limit: "1mb" }));
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, try again later",
  skip: (req) => String(req.path || "").startsWith("/chat"),
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many chat requests, try again shortly",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication requests, try again later",
});

const publicTrackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many tracking requests, try again later",
});

app.use(globalLimiter);
app.use("/chat", chatLimiter);

// ?? cho ph�p truy c?p file upload
// ?? c?u h�nh luu file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Unsupported file type"));
  },
});
const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Hình đại diện chỉ chấp nhận JPG/PNG/WEBP"));
  },
});
const chatUpload = multer({
  storage,
  limits: { fileSize: CHAT_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/avif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/webm",
      "audio/ogg",
      "audio/mpeg",
      "audio/wav",
      "audio/mp4",
    ]);
    if (allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Tệp chat không hợp lệ. Hỗ trợ ảnh (kể cả HEIC), video, audio, txt, pdf, doc/docx."));
  },
});

const FILE_REQUIREMENTS_BY_CASE_TYPE = {
  "Mua bán": ["CCCD", "CONTRACT", "LAND_CERT"],
  "Ủy quyền": ["CCCD", "CONTRACT"],
  "Thừa kế": ["CCCD", "CONTRACT", "LAND_CERT"],
  "Di chúc": ["CCCD"],
  "Chứng thực": ["CCCD"],
  "Khác": ["CCCD"],
};

const CASE_TYPE_OPTIONS = [
  "Mua bán",
  "Ủy quyền",
  "Thừa kế",
  "Di chúc",
  "Chứng thực",
  "Khác",
];

app.get("/avatars/:filename", (req, res) => {
  const filename = path.basename(String(req.params.filename || ""));
  if (!filename.startsWith("avatar-")) {
    return res.status(404).send("Avatar not found");
  }
  const avatarPath = path.join(__dirname, "uploads", filename);
  if (!fs.existsSync(avatarPath)) {
    return res.status(404).send("Avatar not found");
  }
  return res.sendFile(avatarPath);
});

app.get("/uploads/:filename", (req, res) => {
  const filename = path.basename(String(req.params.filename || ""));
  // Expose generated docs and chat media attachments.
  const isAllowed =
    filename.startsWith("template-source-") ||
    filename.endsWith(".docx") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".pdf") ||
    filename.endsWith(".jpg") ||
    filename.endsWith(".jpeg") ||
    filename.endsWith(".png") ||
    filename.endsWith(".webp") ||
    filename.endsWith(".heic") ||
    filename.endsWith(".heif") ||
    filename.endsWith(".avif") ||
    filename.endsWith(".gif") ||
    filename.endsWith(".mp4") ||
    filename.endsWith(".webm") ||
    filename.endsWith(".mov") ||
    filename.endsWith(".mp3") ||
    filename.endsWith(".wav") ||
    filename.endsWith(".ogg") ||
    filename.endsWith(".m4a");
  if (!isAllowed) {
    return res.status(404).send("File not found");
  }
  const filePath = path.join(__dirname, "uploads", filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  return res.sendFile(filePath);
});

function parseMockOcrFromFilename(filename) {
  const idNumberMatch = filename.match(/(?:CCCD|CMND|ID)[_-]?(\d{9,12})/i);
  const fullNameMatch = filename.match(/(?:NAME|TEN)[_-]?([A-ZÀ-Ỹa-zà-ỹ\s]{3,50})/i);
  const dobMatch = filename.match(/(?:DOB|NS)[_-]?(\d{2}[/-]\d{2}[/-]\d{4})/i);

  return {
    idNumber: idNumberMatch?.[1] || null,
    fullName: fullNameMatch?.[1]?.replace(/[_-]/g, " ").trim() || null,
    dateOfBirth: dobMatch?.[1] || null,
    source: "mock_filename_parser",
  };
}

function renderTemplateContent(templateContent, payload) {
  const replacementMap = buildTemplateReplacementMap(payload);
  const replaced = String(templateContent || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, pathKey) => {
    const value = resolvePlaceholderValue(payload, pathKey, replacementMap);
    return value ?? "";
  });
  return replaced
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function interpolateTemplateHtml(templateContent, payload) {
  const replacementMap = buildTemplateReplacementMap(payload);
  return String(templateContent || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, pathKey) => {
    const value = resolvePlaceholderValue(payload, pathKey, replacementMap);
    return value ?? "";
  });
}

function buildDefaultPreviewPayload() {
  const now = new Date();
  return {
    case: {
      id: 1001,
      caseId: "HS-20260429-0001",
      customerId: "KH-0001",
      customerName: "Lê Khoa",
      customerGender: "MALE",
      customerGenderLabel: "Nam",
      customerDateOfBirth: "09/12/1979",
      phone: "0939840860",
      type: "HOP_DONG",
      caseCategory: "Mua bán",
      authorizationKind: "AUTH_CONTRACT",
      certificationKind: "BAN_SAO",
      description: "Hồ sơ xem trước biểu mẫu",
      notes: "Dữ liệu mẫu cho preview nhanh",
      status: "DRAFT",
      assignedTo: "notary01",
      deadline: now.toISOString(),
      priority: "NORMAL",
      notaryBookNumber: "123",
      notaryRecordNumber: "456",
      issuedAt: now.toISOString(),
      isLocked: false,
      feeAmount: 3000000,
      feePaid: 1500000,
      feeReceiptNo: "PT-20260429-001",
      paymentMethod: "CASH",
      draftedBy: "staff01",
      reviewedBy: "notary01",
      signedAt: now.toISOString(),
      sealedAt: now.toISOString(),
      releasedAt: now.toISOString(),
      releaseCode: "REL-20260429-001",
      signatureStatus: "VALID",
      signerName: "Lê Khoa",
      certificateSerial: "ABCD123456",
      signatureProvider: "VNPT-CA",
      signatureCheckedAt: now.toISOString(),
      publicTrackingCode: "TRK-20260429-0001",
      publicTrackingEnabled: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    customer: {
      id: 1,
      customerId: "KH-0001",
      fullName: "Lê Khoa",
      phone: "0939840860",
      idNumber: "079079123456",
      address: "Thu Duc City, Ho Chi Minh City, Vietnam",
      email: "ldakvn1@gmail.com",
      gender: "MALE",
      genderLabel: "Nam",
      dateOfBirth: "09/12/1979",
      notes: "Khách hàng mẫu cho preview",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    office: {
      generatedAt: now.toISOString(),
      generatedBy: "preview_user",
    },
  };
}

function flattenTemplatePayload(obj, prefix = "", target = {}) {
  if (obj === null || obj === undefined) return target;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) target[prefix] = obj;
    return target;
  }
  Object.entries(obj).forEach(([key, value]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenTemplatePayload(value, nextPrefix, target);
    } else {
      target[nextPrefix] = value;
    }
  });
  return target;
}

function buildTemplateReplacementMap(payload) {
  const flatMap = flattenTemplatePayload(payload);
  const map = { ...flatMap };
  const toSnake = (value = "") =>
    String(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[\s.-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  Object.entries(flatMap).forEach(([pathKey, value]) => {
    const fullKeyUnderscore = toSnake(String(pathKey).replace(/\./g, "_"));
    const fullKeyUpper = fullKeyUnderscore.toUpperCase();
    if (!(fullKeyUnderscore in map)) map[fullKeyUnderscore] = value;
    if (!(fullKeyUpper in map)) map[fullKeyUpper] = value;
    const lastSegment = String(pathKey).split(".").pop();
    if (lastSegment) {
      const lastSegmentSnake = toSnake(lastSegment);
      const lastUpper = lastSegmentSnake.toUpperCase();
      if (!(lastSegment in map)) map[lastSegment] = value;
      if (!(lastSegmentSnake in map)) map[lastSegmentSnake] = value;
      if (!(lastUpper in map)) map[lastUpper] = value;
    }
  });
  if (map["case.customerName"] !== undefined) {
    if (!("CUSTOMER_NAME" in map)) map["CUSTOMER_NAME"] = map["case.customerName"];
    if (!("customer_name" in map)) map["customer_name"] = map["case.customerName"];
  } else if (map["customer.fullName"] !== undefined) {
    if (!("CUSTOMER_NAME" in map)) map["CUSTOMER_NAME"] = map["customer.fullName"];
    if (!("customer_name" in map)) map["customer_name"] = map["customer.fullName"];
  }
  return map;
}

function resolvePlaceholderValue(payload, key, replacementMap = null) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return "";
  const dotPathValue = normalizedKey
    .split(".")
    .reduce((acc, pathPart) => (acc && acc[pathPart] !== undefined ? acc[pathPart] : undefined), payload);
  if (dotPathValue !== undefined && dotPathValue !== null) return dotPathValue;
  const map = replacementMap || buildTemplateReplacementMap(payload);
  if (map[normalizedKey] !== undefined && map[normalizedKey] !== null) return map[normalizedKey];
  const upperKey = normalizedKey.toUpperCase();
  if (map[upperKey] !== undefined && map[upperKey] !== null) return map[upperKey];
  return "";
}

function htmlToPlainText(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function renderDocxFromText(textContent = "") {
  const htmlDocument = `<!doctype html><html><head><meta charset="utf-8"></head><body>${escapeHtml(
    textContent
  ).replace(/\n/g, "<br/>")}</body></html>`;
  let renderedDocx = htmlDocx.asBlob(htmlDocument);
  if (renderedDocx && typeof renderedDocx.arrayBuffer === "function") {
    const arr = await renderedDocx.arrayBuffer();
    return Buffer.from(arr);
  }
  if (Buffer.isBuffer(renderedDocx)) return renderedDocx;
  return Buffer.from(renderedDocx);
}

function ensureTemplateContentAnchorInZip(zip) {
  const xmlFiles = zip.file(/word\/(document|header\d*|footer\d*)\.xml/) || [];
  const hasEditorContentAnchor = xmlFiles.some((file) => {
    const xml = String(file?.asText?.() || "");
    return (
      xml.includes("template.content") ||
      xml.includes("template.contentText") ||
      xml.includes("{template.content}") ||
      xml.includes("{template.contentText}")
    );
  });
  if (hasEditorContentAnchor) {
    return { zip, anchorInjected: false };
  }
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    return { zip, anchorInjected: false };
  }
  const originalDocumentXml = String(documentXmlFile.asText?.() || "");
  if (!originalDocumentXml.includes("</w:body>")) {
    return { zip, anchorInjected: false };
  }
  const anchorParagraph =
    '<w:p><w:r><w:t xml:space="preserve">{{template.content}}</w:t></w:r></w:p>';
  let patchedDocumentXml = originalDocumentXml;
  if (patchedDocumentXml.includes("<w:sectPr")) {
    patchedDocumentXml = patchedDocumentXml.replace("<w:sectPr", `${anchorParagraph}<w:sectPr`);
  } else {
    patchedDocumentXml = patchedDocumentXml.replace("</w:body>", `${anchorParagraph}</w:body>`);
  }
  zip.file("word/document.xml", patchedDocumentXml);
  return { zip, anchorInjected: true };
}

function hasTemplateContentAnchorInZip(zip) {
  const xmlFiles = zip.file(/word\/(document|header\d*|footer\d*)\.xml/) || [];
  return xmlFiles.some((file) => {
    const xml = String(file?.asText?.() || "");
    return (
      xml.includes("template.content") ||
      xml.includes("template.contentText") ||
      xml.includes("{template.content}") ||
      xml.includes("{template.contentText}")
    );
  });
}

function hasMustachePlaceholdersInZip(zip) {
  const xmlFiles = zip.file(/word\/(document|header\d*|footer\d*)\.xml/) || [];
  return xmlFiles.some((file) => {
    const xml = String(file?.asText?.() || "");
    return /\{\{\s*[\w.]+\s*\}\}/.test(xml);
  });
}

function extractMustacheTokensFromZip(zip) {
  const xmlFiles = zip.file(/word\/(document|header\d*|footer\d*)\.xml/) || [];
  const tokenSet = new Set();
  xmlFiles.forEach((file) => {
    const xml = String(file?.asText?.() || "");
    const matches = xml.match(/\{\{\s*[\w.]+\s*\}\}/g) || [];
    matches.forEach((token) => tokenSet.add(token.replace(/\s+/g, "")));
  });
  return Array.from(tokenSet).sort((a, b) => a.localeCompare(b));
}

function escapeXmlText(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toWordRunTextXml(value = "") {
  const escaped = escapeXmlText(value);
  return escaped.replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
}

function replaceTemplateContentAnchorsInZip(zip, renderedText) {
  const replacementXml = toWordRunTextXml(renderedText);
  const xmlFiles = zip.file(/word\/(document|header\d*|footer\d*)\.xml/) || [];
  let replaced = false;
  xmlFiles.forEach((xmlFile) => {
    const xml = String(xmlFile?.asText?.() || "");
    const next = xml
      .replace(/\{\{\s*template\.content\s*\}\}/g, replacementXml)
      .replace(/\{\{\s*template\.contentText\s*\}\}/g, replacementXml);
    if (next !== xml) {
      replaced = true;
      zip.file(xmlFile.name, next);
    }
  });
  return { zip, replaced };
}

function replaceScalarPlaceholdersInZip(zip, payload) {
  const scalarMap = buildTemplateReplacementMap(payload);
  const xmlFiles = zip.file(/word\/(document|header\d*|footer\d*)\.xml/) || [];
  xmlFiles.forEach((xmlFile) => {
    let xml = String(xmlFile?.asText?.() || "");
    Object.entries(scalarMap).forEach(([pathKey, rawValue]) => {
      const replacement = escapeXmlText(String(rawValue ?? ""));
      const patterns = [
        new RegExp(`\\{\\{\\s*${pathKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
      ];
      patterns.forEach((pattern) => {
        xml = xml.replace(pattern, replacement);
      });
    });
    zip.file(xmlFile.name, xml);
  });
  return zip;
}

function renderSourceDocxWithDocxtemplater(sourceBinary, payload) {
  const zip = new PizZip(sourceBinary);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  const replacementMap = buildTemplateReplacementMap(payload);
  doc.render({
    ...payload,
    ...replacementMap,
  });
  return doc.getZip().generate({ type: "nodebuffer" });
}

function toIsoOrEmpty(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch (_error) {
    return "";
  }
}

function toViDateOrEmpty(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function toGenderLabelVi(value) {
  if (!value) return "";
  if (value === "MALE") return "Nam";
  if (value === "FEMALE") return "Nữ";
  if (value === "OTHER") return "Khác";
  return String(value);
}

function renderSimplePdfToFile(filePath, title, lines = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 48, size: "A4" });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      doc.fontSize(16).text(title, { align: "center" });
      doc.moveDown();
      for (const line of lines) {
        doc.fontSize(11).text(String(line ?? ""));
      }
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

function verifySignedPdfBasic(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "latin1");
    const hasPdfHeader = raw.startsWith("%PDF-");
    const hasByteRange = raw.includes("/ByteRange");
    const hasContents = raw.includes("/Contents");
    const hasSigField =
      raw.includes("/SubFilter /adbe.pkcs7.detached") || raw.includes("/Type /Sig");
    return {
      valid: hasPdfHeader && hasByteRange && hasContents && hasSigField,
      checks: { hasPdfHeader, hasByteRange, hasContents, hasSigField },
    };
  } catch (error) {
    return { valid: false, checks: { error: "READ_ERROR" } };
  }
}

function extractLast4Digits(text = "") {
  const digits = String(text).replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.slice(-4);
}

async function generateUniquePublicTrackingCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = crypto.randomBytes(12).toString("hex").toUpperCase();
    const exists = await prisma.case.findFirst({
      where: { publicTrackingCode: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error("Unable to generate unique public tracking code");
}

function maskName(value = "") {
  const raw = String(value || "").trim();
  if (raw.length <= 2) return "*".repeat(raw.length);
  return `${raw[0]}${"*".repeat(Math.max(1, raw.length - 2))}${raw[raw.length - 1]}`;
}

function getAppBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:5173";
}

async function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return mailTransporter;
}

async function sendPasswordResetEmail({ to, resetLink }) {
  const transporter = await getMailTransporter();
  if (!transporter) {
    console.warn("SMTP is not configured. Skip sending reset email.");
    return false;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Khôi phục mật khẩu - Hệ thống Văn phòng Công chứng số",
    text: `Bạn vừa yêu cầu khôi phục mật khẩu.\nTruy cập liên kết sau để đặt mật khẩu mới (hiệu lực 30 phút):\n${resetLink}\nNếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.`,
    html: `<p>Bạn vừa yêu cầu khôi phục mật khẩu.</p><p>Truy cập liên kết sau để đặt mật khẩu mới (hiệu lực 30 phút):</p><p><a href="${resetLink}">${resetLink}</a></p><p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.</p>`,
  });
  return true;
}

async function sendNewUserCredentialsEmail({ to, username, temporaryPassword, expiresAt }) {
  const transporter = await getMailTransporter();
  if (!transporter) {
    console.warn("SMTP is not configured. Skip sending new user credentials email.");
    return false;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Tài khoản mới - Văn phòng Công chứng số",
    text: `Tài khoản của bạn đã được tạo.\nUsername: ${username}\nMật khẩu tạm: ${temporaryPassword}\nHạn đổi mật khẩu lần đầu: ${new Date(expiresAt).toISOString()}\nBạn bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.`,
    html: `<p>Tài khoản của bạn đã được tạo.</p><p><b>Username:</b> ${username}<br/><b>Mật khẩu tạm:</b> ${temporaryPassword}<br/><b>Hạn đổi mật khẩu lần đầu:</b> ${new Date(expiresAt).toLocaleString("vi-VN")}</p><p>Bạn bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.</p>`,
  });
  return true;
}
async function sendCaseStatusUpdateEmail({
  to,
  caseId,
  customerName,
  fromStatus,
  toStatus,
  trackingPath = "",
  bccEmails = [],
}) {
  const transporter = await getMailTransporter();
  if (!transporter) {
    console.warn("SMTP is not configured. Skip sending case status update email.");
    return false;
  }
  const fromLabel = WORKFLOW_STATUS_LABELS_VI[fromStatus] || fromStatus || "-";
  const toLabel = WORKFLOW_STATUS_LABELS_VI[toStatus] || toStatus || "-";
  const trackingUrl = trackingPath ? `${getAppBaseUrl()}${trackingPath}` : "";
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    bcc: Array.isArray(bccEmails) && bccEmails.length > 0 ? bccEmails.join(",") : undefined,
    subject: `Cập nhật trạng thái hồ sơ ${caseId} - Văn phòng Công chứng số`,
    text: [
      `Hồ sơ ${caseId} của khách hàng ${customerName || "-"} vừa được cập nhật trạng thái.`,
      `Từ: ${fromLabel}`,
      `Sang: ${toLabel}`,
      trackingUrl
        ? `Bạn có thể tra cứu tiến độ tại: ${trackingUrl}`
        : "Liên kết tra cứu sẽ được gửi khi hồ sơ được bật tra cứu công khai.",
    ].join("\n"),
    html: `
      <p>Hồ sơ <b>${caseId}</b> của khách hàng <b>${customerName || "-"}</b> vừa được cập nhật trạng thái.</p>
      <p><b>Từ:</b> ${fromLabel}<br/><b>Sang:</b> ${toLabel}</p>
      ${
        trackingUrl
          ? `<p>Bạn có thể tra cứu tiến độ tại: <a href="${trackingUrl}">${trackingUrl}</a></p>`
          : "<p>Liên kết tra cứu sẽ được gửi khi hồ sơ được bật tra cứu công khai.</p>"
      }
    `,
  });
  return true;
}
async function resolveCaseStatusEmailBcc({ caseItem, actorUsername }) {
  const usernames = new Set();
  const createdBy = caseItem?.history?.[0]?.user;
  const assignedTo = caseItem?.assignedTo;
  if (createdBy) usernames.add(String(createdBy).trim());
  if (assignedTo) usernames.add(String(assignedTo).trim());
  if (actorUsername) usernames.add(String(actorUsername).trim());
  const usernameList = Array.from(usernames).filter(Boolean);
  if (usernameList.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: usernameList } },
    select: { email: true },
  });
  return users
    .map((item) => normalizeEmail(item.email))
    .filter(Boolean);
}
function resolveRelatedCaseUsernames({ caseItem, actorUsername }) {
  const usernames = new Set();
  const createdBy = caseItem?.history?.[0]?.user;
  const assignedTo = caseItem?.assignedTo;
  if (createdBy) usernames.add(String(createdBy).trim());
  if (assignedTo) usernames.add(String(assignedTo).trim());
  if (actorUsername) usernames.add(String(actorUsername).trim());
  return Array.from(usernames).filter(Boolean);
}

function getInitialPasswordExpiry() {
  return new Date(Date.now() + INITIAL_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function generateTemporaryPassword(length = 12) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

function getVietnamDateStamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function normalizeLegacyNotificationMessage(message) {
  const text = String(message || "");
  const overdueMatch = text.match(/^Ho so\s+(.+)\s+da qua han\s+(\d+)\s+ngay$/i);
  if (overdueMatch) {
    return `Hồ sơ ${overdueMatch[1]} đã quá hạn ${overdueMatch[2]} ngày`;
  }
  return text;
}

async function generateCaseCode() {
  const dateStamp = getVietnamDateStamp();
  const prefix = `HS-${dateStamp}-`;
  const latestCase = await prisma.case.findFirst({
    where: {
      caseId: {
        startsWith: prefix,
      },
    },
    orderBy: { caseId: "desc" },
    select: { caseId: true },
  });

  let nextIndex = 1;
  if (latestCase?.caseId) {
    const lastSequence = Number(latestCase.caseId.split("-")[2] || "0");
    nextIndex = lastSequence + 1;
  }

  return `${prefix}${String(nextIndex).padStart(4, "0")}`;
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function normalizeLoginId(loginId) {
  return String(loginId || "")
    .trim()
    .toLowerCase();
}

async function findUserByLoginId(loginId) {
  const normalizedLoginId = normalizeLoginId(loginId);
  if (!normalizedLoginId) return null;
  return prisma.user.findFirst({
    where: {
      OR: [{ username: normalizedLoginId }, { email: normalizedLoginId }],
    },
  });
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isStrongPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

async function ensureEmailUniqueOrThrow({ email, excludeUsername } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return normalizedEmail;
  const existing = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
      ...(excludeUsername
        ? {
            username: {
              not: normalizeUsername(excludeUsername),
            },
          }
        : {}),
    },
    select: { username: true },
  });
  if (existing) {
    const error = new Error("EMAIL_ALREADY_IN_USE");
    error.code = "EMAIL_ALREADY_IN_USE";
    throw error;
  }
  return normalizedEmail;
}

function createLoginCaptchaChallenge({ loginId, ip }) {
  const left = Math.floor(Math.random() * 10) + 1;
  const right = Math.floor(Math.random() * 10) + 1;
  const answer = String(left + right);
  const token = jwt.sign(
    {
      type: "login_captcha",
      loginId: normalizeLoginId(loginId),
      ip,
      answer,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
  return {
    token,
    question: `${left} + ${right} = ?`,
  };
}

function verifyLoginCaptcha({ token, answer, loginId, ip }) {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (decoded.type !== "login_captcha") return false;
    if (decoded.loginId !== normalizeLoginId(loginId)) return false;
    if (decoded.ip !== ip) return false;
    return String(decoded.answer) === String(answer || "").trim();
  } catch (_error) {
    return false;
  }
}

function getClientIp(req) {
  const raw = String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    .trim();
  return raw || "unknown";
}

async function getOrCreateLoginAttempt(key) {
  const existing = await prisma.loginAttempt.findUnique({ where: { key } });
  if (existing) return existing;
  return prisma.loginAttempt.create({
    data: {
      key,
      failCount: 0,
      firstAttemptAt: new Date(),
      lastAttemptAt: new Date(),
      lockUntil: null,
      lockLevel: 0,
    },
  });
}

async function isAnyLoginLocked(keys = []) {
  const now = new Date();
  for (const key of keys) {
    const row = await prisma.loginAttempt.findUnique({ where: { key } });
    if (row?.lockUntil && row.lockUntil > now) {
      return row.lockUntil;
    }
  }
  return null;
}

async function shouldRequireCaptcha(keys = []) {
  for (const key of keys) {
    const row = await prisma.loginAttempt.findUnique({ where: { key } });
    if (!row) continue;
    if (row.failCount >= 3 || row.lockLevel >= 1) {
      return true;
    }
  }
  return false;
}

async function trackLoginFailureByKey(key) {
  const row = await getOrCreateLoginAttempt(key);
  const now = new Date();
  const windowExpired = now.getTime() - new Date(row.firstAttemptAt).getTime() > LOGIN_LOCK_TIME_MS;
  const nextFailCount = windowExpired ? 1 : row.failCount + 1;
  const nextFirstAttemptAt = windowExpired ? now : row.firstAttemptAt;
  let nextLockUntil = row.lockUntil;
  let nextLockLevel = row.lockLevel || 0;

  if (nextFailCount >= MAX_LOGIN_ATTEMPTS) {
    nextLockLevel = Math.min(nextLockLevel + 1, MAX_LOCK_LEVEL);
    const lockMs = LOGIN_LOCK_TIME_MS * Math.max(1, nextLockLevel);
    nextLockUntil = new Date(now.getTime() + lockMs);
  }

  await prisma.loginAttempt.update({
    where: { key },
    data: {
      failCount: nextFailCount >= MAX_LOGIN_ATTEMPTS ? 0 : nextFailCount,
      firstAttemptAt: nextFailCount >= MAX_LOGIN_ATTEMPTS ? now : nextFirstAttemptAt,
      lastAttemptAt: now,
      lockUntil: nextLockUntil,
      lockLevel: nextLockLevel,
    },
  });

  if (nextFailCount >= MAX_LOGIN_ATTEMPTS) {
    await createNotificationForUsername({
      username: "admin",
      message: `Canh bao brute-force: ${key} bi khoa tam thoi cap ${nextLockLevel}`,
      type: "warning",
      actionUrl: null,
    });
  }
}

async function clearLoginFailuresByKey(key) {
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  if (!row) return;
  await prisma.loginAttempt.update({
    where: { key },
    data: {
      failCount: 0,
      firstAttemptAt: new Date(),
      lastAttemptAt: new Date(),
      lockUntil: null,
    },
  });
}

function validateRequest(validations) {
  return [
    ...validations,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: "Validation failed",
          errors: errors.array().map((item) => ({ field: item.path, message: item.msg })),
        });
      }
      next();
    },
  ];
}

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, PASSWORD_SALT_ROUNDS);
}

async function verifyPassword(plainText, storedPassword) {
  if (!storedPassword) return false;
  if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$")) {
    return bcrypt.compare(plainText, storedPassword);
  }
  // Backward compatibility for legacy plaintext rows.
  return plainText === storedPassword;
}

async function ensurePasswordHashed(user, plainTextPassword) {
  if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
    return;
  }
  const hashedPassword = await hashPassword(plainTextPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });
}

async function createAuthSession(user) {
  const sessionId = crypto.randomUUID();
  const accessToken = jwt.sign(
    { username: user.username, role: user.role, type: "access", sessionId, id: user.id },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  const refreshToken = jwt.sign(
    { username: user.username, sessionId, type: "refresh" },
    REFRESH_TOKEN_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );
  const refreshTokenHash = await bcrypt.hash(refreshToken, PASSWORD_SALT_ROUNDS);

  await prisma.session.create({
    data: {
      sessionId,
      userId: user.id,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken };
}

function getMissingRequiredFileTypes(caseItem) {
  const required = FILE_REQUIREMENTS_BY_CASE_TYPE[caseItem.type] || ["CCCD"];
  const existingTypes = new Set((caseItem.files || []).map((f) => f.fileType));
  return required.filter((requiredType) => !existingTypes.has(requiredType));
}

function ensureCaseNotLocked(caseItem, res) {
  if (caseItem.isLocked) {
    res.status(423).send("Hồ sơ đã khóa nghiệp vụ, không thể chỉnh sửa");
    return false;
  }
  return true;
}

function canCoordinateCaseAssignment(userRole) {
  return userRole === "admin" || userRole === "notary_officer";
}

function ensureCaseAssignmentAccess(req, res, caseItem, options = {}) {
  const {
    allowWhenUnassigned = true,
    allowCoordinator = false,
    allowAccountant = false,
    actionLabel = "chỉnh sửa hồ sơ",
  } = options;
  const role = String(req.user?.role || "").toLowerCase();
  const actor = String(req.user?.username || "").trim().toLowerCase();
  const assignedTo = String(caseItem?.assignedTo || "").trim().toLowerCase();
  const assignedDisplay = String(caseItem?.assignedTo || "").trim();
  const caseCode = caseItem?.caseId || `#${caseItem?.id || "?"}`;

  if (role === "admin") return true;
  if (allowCoordinator && canCoordinateCaseAssignment(role)) return true;
  if (allowAccountant && role === USER_ROLES.ACCOUNTANT) return true;
  if (!assignedTo && allowWhenUnassigned) return true;
  if (assignedTo && actor && assignedTo === actor) return true;

  if (assignedDisplay) {
    res
      .status(403)
      .send(
        `Bạn không có quyền ${actionLabel}. Hồ sơ ${caseCode} đang được phân công cho "${assignedDisplay}".`
      );
    return false;
  }
  res
    .status(403)
    .send(
      `Bạn không có quyền ${actionLabel}. Hồ sơ ${caseCode} chưa được phân công cho bạn, vui lòng liên hệ người điều phối.`
    );
  return false;
}

async function generateNotaryNumbers() {
  const year = new Date().getFullYear();
  const bookNumber = `SO-${year}`;
  const latest = await prisma.case.findFirst({
    where: {
      notaryBookNumber: bookNumber,
      notaryRecordNumber: { not: null },
    },
    orderBy: { notaryRecordNumber: "desc" },
    select: { notaryRecordNumber: true },
  });
  const nextRecordNumber = (latest?.notaryRecordNumber || 0) + 1;
  return { bookNumber, recordNumber: nextRecordNumber };
}

async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `PT-${year}-`;
  const latestReceipt = await prisma.receipt.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: "desc" },
    select: { receiptNo: true },
  });
  let nextIndex = 1;
  if (latestReceipt?.receiptNo) {
    const lastSequence = Number(latestReceipt.receiptNo.split("-")[2] || "0");
    nextIndex = lastSequence + 1;
  }
  return `${prefix}${String(nextIndex).padStart(5, "0")}`;
}

async function syncCaseFeeSummary(caseId, actorUsername = "system") {
  const receiptStats = await prisma.receipt.aggregate({
    where: { caseId },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const latestReceipt = await prisma.receipt.findFirst({
    where: { caseId },
    orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
    select: { receiptNo: true, paymentMethod: true },
  });
  const paidValue = Number(receiptStats?._sum?.amount || 0);
  await prisma.case.update({
    where: { id: caseId },
    data: {
      feePaid: paidValue,
      feeReceiptNo: latestReceipt?.receiptNo || null,
      paymentMethod: latestReceipt?.paymentMethod || null,
    },
  });
  await autoAdvanceFinancialWorkflow(caseId, actorUsername);
}

async function notifyCaseStatusTransition({ caseItem, updatedCase, actorUsername = "system" }) {
  const relatedUsernames = resolveRelatedCaseUsernames({
    caseItem,
    actorUsername,
  });
  const fromLabel = WORKFLOW_STATUS_LABELS_VI[caseItem.status] || caseItem.status;
  const toLabel = WORKFLOW_STATUS_LABELS_VI[updatedCase.status] || updatedCase.status;
  await Promise.all(
    relatedUsernames.map((username) =>
      createNotificationForUsername({
        username,
        caseId: updatedCase.id,
        message: `Hồ sơ ${updatedCase.caseId}: ${fromLabel} -> ${toLabel}`,
        type: "info",
        actionUrl: `/cases/${updatedCase.id}`,
      })
    )
  );
  const customerEmail = normalizeEmail(caseItem.customer?.email || "");
  if (customerEmail && updatedCase.publicTrackingEnabled) {
    const trackingPath = updatedCase.publicTrackingCode ? `/track/${updatedCase.publicTrackingCode}` : "";
    try {
      const bccEmails = await resolveCaseStatusEmailBcc({
        caseItem,
        actorUsername,
      });
      await sendCaseStatusUpdateEmail({
        to: customerEmail,
        caseId: updatedCase.caseId,
        customerName: updatedCase.customerName,
        fromStatus: caseItem.status,
        toStatus: updatedCase.status,
        trackingPath,
        bccEmails,
      });
    } catch (mailError) {
      console.error("Failed to send case status email:", mailError);
    }
  }
}

function parseAuditDetailsJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return null;
  }
}

function getFinancialResumeEligibleStatuses() {
  return [
    WORKFLOW_STATUS.LEGAL_CHECKING,
    WORKFLOW_STATUS.DRAFTING,
    WORKFLOW_STATUS.REVIEWING,
    WORKFLOW_STATUS.APPROVED,
    WORKFLOW_STATUS.NOTARIZED,
    WORKFLOW_STATUS.DEBT,
    WORKFLOW_STATUS.ARCHIVED,
  ];
}

async function resolvePendingFinancialResetTarget(caseId) {
  const resetLog = await prisma.auditLog.findFirst({
    where: { caseId, action: "CASE_FINANCIAL_RESET" },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true, details: true },
  });
  if (!resetLog) return null;
  const resumedLog = await prisma.auditLog.findFirst({
    where: {
      caseId,
      action: "CASE_FINANCIAL_RESUMED",
      timestamp: { gt: resetLog.timestamp },
    },
    orderBy: { timestamp: "desc" },
    select: { id: true },
  });
  if (resumedLog?.id) return null;
  const details = parseAuditDetailsJson(resetLog.details);
  const targetStatus = String(details?.preResetStatus || "").toUpperCase();
  if (!getFinancialResumeEligibleStatuses().includes(targetStatus)) return null;
  return {
    targetStatus,
    resetLogId: resetLog.id,
  };
}

async function autoAdvanceFinancialWorkflow(caseId, actorUsername = "system") {
  for (let i = 0; i < 3; i += 1) {
    const caseItem = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        customer: true,
        history: {
          orderBy: { timestamp: "asc" },
          take: 1,
        },
      },
    });
    if (!caseItem) return;

    const feeAmount = Number(caseItem.feeAmount || 0);
    const feePaid = Number(caseItem.feePaid || 0);
    const pendingResetResume = await resolvePendingFinancialResetTarget(caseId);
    let targetStatus = null;
    const canPassThirtyPercent = feeAmount > 0 && feePaid >= feeAmount * 0.3;
    const canPassFull = feeAmount > 0 && feePaid >= feeAmount;
    if (pendingResetResume && caseItem.status === WORKFLOW_STATUS.RECEIVED) {
      if (pendingResetResume.targetStatus === WORKFLOW_STATUS.ARCHIVED) {
        targetStatus = canPassFull ? WORKFLOW_STATUS.ARCHIVED : feeAmount > 0 ? WORKFLOW_STATUS.RECEIPT : null;
      } else {
        targetStatus = canPassThirtyPercent
          ? pendingResetResume.targetStatus
          : feeAmount > 0
            ? WORKFLOW_STATUS.RECEIPT
            : null;
      }
    } else if (caseItem.status === WORKFLOW_STATUS.RECEIVED && feeAmount > 0) {
      targetStatus = WORKFLOW_STATUS.RECEIPT;
    } else if (
      caseItem.status === WORKFLOW_STATUS.RECEIPT &&
      canPassThirtyPercent
    ) {
      targetStatus = WORKFLOW_STATUS.LEGAL_CHECKING;
    } else if (caseItem.status === WORKFLOW_STATUS.DEBT && canPassFull) {
      targetStatus = WORKFLOW_STATUS.ARCHIVED;
    }
    if (!targetStatus) return;

    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: {
        status: targetStatus,
        isLocked: targetStatus === WORKFLOW_STATUS.ARCHIVED ? true : caseItem.isLocked,
        publicTrackingCode:
          shouldEnablePublicTrackingByStatus(targetStatus)
            ? caseItem.publicTrackingCode || (await generateUniquePublicTrackingCode())
            : caseItem.publicTrackingCode,
        publicTrackingEnabled:
          shouldEnablePublicTrackingByStatus(targetStatus) ? true : caseItem.publicTrackingEnabled,
        history: {
          create: {
            action: "STATUS_CHANGED",
            fromStatus: caseItem.status,
            toStatus: targetStatus,
            notes: "Tự động chuyển trạng thái theo tiến độ thu phí",
            user: actorUsername || "system",
          },
        },
      },
      include: { customer: true, history: true },
    });

    await notifyCaseStatusTransition({ caseItem, updatedCase, actorUsername });
    if (
      pendingResetResume &&
      updatedCase.status === pendingResetResume.targetStatus &&
      getFinancialResumeEligibleStatuses().includes(updatedCase.status)
    ) {
      await prisma.auditLog.create({
        data: {
          caseId,
          action: "CASE_FINANCIAL_RESUMED",
          notes: `Resumed to ${updatedCase.status}`,
          user: actorUsername || "system",
          details: JSON.stringify({
            resumedStatus: updatedCase.status,
            resetLogId: pendingResetResume.resetLogId,
          }),
        },
      });
    }
  }
}

async function createNotificationForUsername({
  username,
  caseId,
  message,
  type = "info",
  actionUrl = null,
}) {
  if (!username) return;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return;
  await prisma.notification.create({
    data: {
      userId: user.id,
      caseId: caseId ?? null,
      message,
      type,
      actionUrl,
    },
  });
}

async function createUserSecurityAuditLog({
  actor,
  action,
  targetUsername,
  notes = "",
  details,
}) {
  await prisma.auditLog.create({
    data: {
      caseId: null,
      action,
      notes,
      user: actor || "system",
      details: JSON.stringify({
        targetUsername,
        ...(details || {}),
      }),
    },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function createCaseLegalAuditLog({
  caseId,
  actor,
  action,
  fromStatus = null,
  toStatus = null,
  notes = "",
  details,
}) {
  await prisma.auditLog.create({
    data: {
      caseId: caseId ?? null,
      action,
      fromStatus,
      toStatus,
      notes,
      user: actor || "system",
      details: details ? JSON.stringify(details) : null,
    },
  });
}

async function findDuplicateCustomerByPhoneOrIdNumber({ phone, idNumber }) {
  const normalizedPhone = String(phone || "").trim();
  const normalizedIdNumber = String(idNumber || "").trim();
  if (!normalizedPhone && !normalizedIdNumber) return null;
  const or = [];
  if (normalizedPhone) or.push({ phone: normalizedPhone });
  if (normalizedIdNumber) or.push({ idNumber: normalizedIdNumber });
  if (or.length === 0) return null;
  return prisma.customer.findFirst({
    where: { OR: or },
    select: { id: true, customerId: true, fullName: true, phone: true, idNumber: true },
  });
}

const CASE_CATEGORIES = {
  CONTRACT: "CONTRACT",
  WILL: "WILL",
  INHERITANCE: "INHERITANCE",
  AUTHORIZATION: "AUTHORIZATION",
  CERTIFICATION: "CERTIFICATION",
};

const AUTHORIZATION_KINDS = {
  CONTRACT: "AUTH_CONTRACT",
  LETTER: "AUTH_LETTER",
};

const CERTIFICATION_KINDS = {
  COPY: "CERT_COPY",
  SIGNATURE: "CERT_SIGNATURE",
  TRANSLATOR_SIGNATURE: "CERT_TRANSLATOR_SIGNATURE",
};

const INHERITANCE_POSTING_RESULTS = {
  PENDING: "PENDING",
  NO_CLAIM: "NO_CLAIM",
  HAS_CLAIM: "HAS_CLAIM",
};

const ARCHIVE_RETENTION_YEARS = 20;

function calculateArchiveRetentionUntil(fromDate = new Date()) {
  const next = new Date(fromDate);
  next.setFullYear(next.getFullYear() + ARCHIVE_RETENTION_YEARS);
  return next;
}

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function buildAuditLogWhereClause({
  scope = "all",
  from,
  to,
  actor,
  action,
  caseId,
  search,
}) {
  const where = {};
  if (scope === "case") {
    where.caseId = { not: null };
  } else if (scope === "user") {
    where.caseId = null;
  }
  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = new Date(from);
    if (to) where.timestamp.lte = new Date(to);
  }
  if (actor) {
    where.user = String(actor).trim();
  }
  if (action) {
    where.action = String(action).trim();
  }
  if (caseId) {
    where.caseId = Number(caseId);
  }
  if (search) {
    const keyword = String(search).trim();
    if (keyword) {
      where.OR = [
        { notes: { contains: keyword } },
        { details: { contains: keyword } },
        { action: { contains: keyword } },
        { user: { contains: keyword } },
      ];
    }
  }
  return where;
}

function normalizeAuditLogRow(log) {
  const details = safeParseJson(log.details);
  return {
    id: log.id,
    timestamp: log.timestamp,
    action: log.action,
    actor: log.user,
    caseId: log.caseId,
    notes: log.notes || "",
    targetUsername: details?.targetUsername || "",
    details,
  };
}

function toCsvString(rows = []) {
  return rows
    .map((line) =>
      line
        .map((value) => {
          const raw = String(value ?? "");
          if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
            return `"${raw.replace(/"/g, '""')}"`;
          }
          return raw;
        })
        .join(",")
    )
    .join("\n");
}

function sendDownloadWithHash(res, { filename, contentType, buffer }) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Content-SHA256", sha256);
  return res.send(buffer);
}

const defaultUsers = [
  {
    username: "admin",
    password: "123",
    role: "admin",
    fullName: "Quản trị viên hệ thống",
    email: "admin@notary.local",
    phone: "0900000001",
  },
  {
    username: "notary",
    password: "123",
    role: "notary_officer",
    fullName: "Notary Officer",
    email: "notary@notary.local",
    phone: "0900000002",
  },
  {
    username: "staff",
    password: "123",
    role: "staff",
    fullName: "Office Staff",
    email: "staff@notary.local",
    phone: "0900000003",
  },
  {
    username: "viewer",
    password: "123",
    role: "viewer",
    fullName: "Read Only User",
    email: "viewer@notary.local",
    phone: "0900000004",
  },
  {
    username: "accountant",
    password: "123",
    role: "accountant",
    fullName: "Kế toán viên",
    email: "accountant@notary.local",
    phone: "0900000005",
  },
];

async function generateTemplateCode() {
  const prefix = "TMPL";
  const existing = await prisma.documentTemplate.findMany({
    where: {
      code: {
        startsWith: `${prefix}_`,
      },
    },
    select: { code: true },
  });
  const usedNumbers = new Set(
    existing
      .map((item) => Number(String(item.code).slice(prefix.length + 1)))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
  let next = 1;
  while (usedNumbers.has(next)) next += 1;
  return `${prefix}_${String(next).padStart(3, "0")}`;
}

async function seedDefaultUsers() {
  const count = await prisma.user.count();
  if (count === 0) {
    for (const user of defaultUsers) {
      await prisma.user.create({
        data: {
          ...user,
          password: await hashPassword(user.password),
        },
      });
    }
    console.log("Seeded default users");
  }
}

seedDefaultUsers().catch((error) => {
  console.error("User seeding error:", error);
});

// Template seeding/backfill is intentionally disabled.
// Templates must be created and managed manually from UI/workflow.

// ================== USER ROLES & PERMISSIONS ==================
const WORKFLOW_STATUS = {
  RECEIVED: "RECEIVED",
  RECEIPT: "RECEIPT",
  LEGAL_CHECKING: "LEGAL_CHECKING",
  DRAFTING: "DRAFTING",
  REVIEWING: "REVIEWING",
  APPROVED: "APPROVED",
  NOTARIZED: "NOTARIZED",
  DEBT: "DEBT",
  ARCHIVED: "ARCHIVED",
  CANCELLED: "CANCELLED",
};

const WORKFLOW_STATUS_LABELS_VI = {
  [WORKFLOW_STATUS.RECEIVED]: "Đã tiếp nhận",
  [WORKFLOW_STATUS.RECEIPT]: "Phiếu thu",
  [WORKFLOW_STATUS.LEGAL_CHECKING]: "Kiểm tra pháp lý",
  [WORKFLOW_STATUS.DRAFTING]: "Soạn thảo",
  [WORKFLOW_STATUS.REVIEWING]: "Đang duyệt",
  [WORKFLOW_STATUS.APPROVED]: "Đã duyệt",
  [WORKFLOW_STATUS.NOTARIZED]: "Đã công chứng",
  [WORKFLOW_STATUS.DEBT]: "Công nợ",
  [WORKFLOW_STATUS.ARCHIVED]: "Đã lưu trữ",
  [WORKFLOW_STATUS.CANCELLED]: "Đã hủy",
};
const WORKFLOW_STATUS_LABELS_EN = {
  [WORKFLOW_STATUS.RECEIVED]: "Received",
  [WORKFLOW_STATUS.RECEIPT]: "Receipt",
  [WORKFLOW_STATUS.LEGAL_CHECKING]: "Legal checking",
  [WORKFLOW_STATUS.DRAFTING]: "Drafting",
  [WORKFLOW_STATUS.REVIEWING]: "Reviewing",
  [WORKFLOW_STATUS.APPROVED]: "Approved",
  [WORKFLOW_STATUS.NOTARIZED]: "Notarized",
  [WORKFLOW_STATUS.DEBT]: "Debt",
  [WORKFLOW_STATUS.ARCHIVED]: "Archived",
  [WORKFLOW_STATUS.CANCELLED]: "Cancelled",
};

const USER_ROLES = {
  ADMIN: "admin",
  NOTARY_OFFICER: "notary_officer",
  ACCOUNTANT: "accountant",
  STAFF: "staff",
  VIEWER: "viewer",
};
const TEMPLATE_STATUS = {
  DRAFT: "DRAFT",
  UNDER_REVIEW: "UNDER_REVIEW",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

function canCreateTemplate(_role) {
  return true;
}
function canReviewTemplate(role) {
  return role === USER_ROLES.NOTARY_OFFICER || role === USER_ROLES.ADMIN;
}
function canApproveTemplate(role) {
  return role === USER_ROLES.ADMIN;
}

const PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    "create_case",
    "update_case",
    "delete_case",
    "manage_users",
    "view_all",
    "manage_templates",
    "approve_case",
    "notarize_case",
    "generate_document",
    "sign_release",
    "manage_receipts",
  ],
  [USER_ROLES.NOTARY_OFFICER]: [
    "create_case",
    "update_case",
    "approve_case",
    "notarize_case",
    "view_all",
    "generate_document",
    "sign_release",
  ],
  [USER_ROLES.STAFF]: [
    "create_case",
    "update_case",
    "upload_files",
    "view_assigned",
    "generate_document",
    "sign_release",
  ],
  [USER_ROLES.VIEWER]: ["view_all"],
  [USER_ROLES.ACCOUNTANT]: ["view_all", "manage_receipts"],
};

const ENTERPRISE_REPORT_ACCESS = {
  [USER_ROLES.ADMIN]: ["operations", "staff", "finance", "legal"],
  [USER_ROLES.NOTARY_OFFICER]: ["operations", "legal"],
  [USER_ROLES.ACCOUNTANT]: ["finance"],
  [USER_ROLES.STAFF]: [],
  [USER_ROLES.VIEWER]: ["operations"],
};

const NOTARY_REGISTER_EXPORT_ROLES = [USER_ROLES.ADMIN, USER_ROLES.NOTARY_OFFICER];
const PAYMENT_METHODS = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
};
function shouldEnablePublicTrackingByStatus(status) {
  return [
    WORKFLOW_STATUS.LEGAL_CHECKING,
    WORKFLOW_STATUS.DRAFTING,
    WORKFLOW_STATUS.REVIEWING,
    WORKFLOW_STATUS.APPROVED,
    WORKFLOW_STATUS.NOTARIZED,
    WORKFLOW_STATUS.DEBT,
    WORKFLOW_STATUS.ARCHIVED,
  ].includes(status);
}
function validateFeeThresholdForStatus(status, feeAmount, feePaid) {
  const total = Number(feeAmount || 0);
  const paid = Number(feePaid || 0);
  if (total <= 0) return null;
  const checkpointStatuses = [
    WORKFLOW_STATUS.LEGAL_CHECKING,
    WORKFLOW_STATUS.DRAFTING,
    WORKFLOW_STATUS.REVIEWING,
    WORKFLOW_STATUS.APPROVED,
    WORKFLOW_STATUS.NOTARIZED,
  ];
  if (checkpointStatuses.includes(status) && paid < total * 0.3) {
    return "Không thể cập nhật vì hồ sơ đã qua mốc pháp lý, cần duy trì tối thiểu 30% Tổng chi phí.";
  }
  if (status === WORKFLOW_STATUS.ARCHIVED && paid < total) {
    return "Không thể cập nhật vì hồ sơ đã lưu trữ, cần duy trì đủ 100% Tổng chi phí.";
  }
  return null;
}
const CASE_TYPE_LABELS = {
  "Mua bán": { vi: "Mua bán", en: "Sale/Purchase" },
  "Ủy quyền": { vi: "Ủy quyền", en: "Authorization" },
  "Thừa kế": { vi: "Thừa kế", en: "Inheritance" },
  "Di chúc": { vi: "Di chúc", en: "Will" },
  "Chứng thực": { vi: "Chứng thực", en: "Certification" },
  "Khác": { vi: "Khác", en: "Other" },
};
const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHODS.CASH]: { vi: "Tiền mặt", en: "Cash" },
  [PAYMENT_METHODS.BANK_TRANSFER]: { vi: "Chuyển khoản", en: "Bank transfer" },
};
function toCaseTypeLabelByLang(value, lang = "vi") {
  const normalizedLang = lang === "en" ? "en" : "vi";
  const fallback = String(value || "");
  return CASE_TYPE_LABELS[fallback]?.[normalizedLang] || fallback;
}
function toWorkflowStatusLabelByLang(value, lang = "vi") {
  const normalizedLang = lang === "en" ? "en" : "vi";
  if (normalizedLang === "en") return WORKFLOW_STATUS_LABELS_EN[value] || String(value || "");
  return WORKFLOW_STATUS_LABELS_VI[value] || String(value || "");
}
function toPaymentMethodLabelByLang(value, lang = "vi") {
  const normalizedLang = lang === "en" ? "en" : "vi";
  const key = String(value || PAYMENT_METHODS.CASH).toUpperCase();
  return PAYMENT_METHOD_LABELS[key]?.[normalizedLang] || key;
}

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send("Access token required");
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (decoded.type && decoded.type !== "access") {
      return res.status(403).send("Invalid token type");
    }
    if (!decoded.sessionId) {
      return res.status(403).send("Invalid session");
    }
    const session = await prisma.session.findUnique({
      where: { sessionId: decoded.sessionId },
      select: { revokedAt: true, expiresAt: true, userId: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(403).send("Session expired");
    }
    req.user = { ...decoded, id: session.userId };
    next();
  } catch (err) {
    return res.status(403).send("Invalid token");
  }
};

io.use(async (socket, next) => {
  try {
    const tokenFromAuth = socket.handshake?.auth?.token;
    const headerAuth = socket.handshake?.headers?.authorization || "";
    const tokenFromHeader = String(headerAuth).startsWith("Bearer ")
      ? String(headerAuth).slice("Bearer ".length)
      : "";
    const token = tokenFromAuth || tokenFromHeader;
    if (!token) return next(new Error("Access token required"));
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (decoded.type && decoded.type !== "access") return next(new Error("Invalid token type"));
    if (!decoded.sessionId) return next(new Error("Invalid session"));
    const session = await prisma.session.findUnique({ where: { sessionId: decoded.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return next(new Error("Session expired"));
    }
    const actor = await prisma.user.findUnique({ where: { username: decoded.username } });
    if (!actor || actor.isActive === false) return next(new Error("User not found"));
    socket.data.user = {
      id: actor.id,
      username: actor.username,
    };
    return next();
  } catch (error) {
    return next(new Error("Invalid token"));
  }
});

/** WebRTC call signaling (Phase 1): in-memory sessions, relayed via emitToUser. */
const WEBRTC_CALL_MAX_GROUP_PEERS = 6;
const activeCalls = new Map();

io.on("connection", (socket) => {
  const actor = socket.data.user;
  if (!actor?.id) return;
  addUserSocket(actor.id, socket.id);
  prisma.chatPresence
    .upsert({
      where: { userId: actor.id },
      update: { lastSeenAt: new Date() },
      create: { userId: actor.id, lastSeenAt: new Date(), status: CHAT_STATUS.AVAILABLE },
    })
    .catch(() => {});
  prisma.chatPresence
    .findUnique({ where: { userId: actor.id }, select: { status: true } })
    .then((presence) => {
      const status = CHAT_STATUS_VALUES.has(String(presence?.status || "")) ? String(presence.status) : CHAT_STATUS.AVAILABLE;
      socket.broadcast.emit("chat:presence", {
        userId: actor.id,
        username: actor.username,
        online: status !== CHAT_STATUS.INVISIBLE,
        status,
      });
    })
    .catch(() => {});

  socket.on("chat:presence:ping", async () => {
    try {
      await prisma.chatPresence.upsert({
        where: { userId: actor.id },
        update: { lastSeenAt: new Date() },
        create: { userId: actor.id, lastSeenAt: new Date(), status: CHAT_STATUS.AVAILABLE },
      });
    } catch (_error) {}
  });

  socket.on("call:invite", async (raw) => {
    try {
      const callId = String(raw?.callId || "").trim();
      const mode = raw?.mode === "group" ? "group" : "direct";
      if (!callId) return socket.emit("call:error", { message: "missing_call_id" });
      if (activeCalls.has(callId)) return socket.emit("call:error", { message: "call_exists" });

      const media = {
        audio: raw?.media?.audio !== false,
        video: Boolean(raw?.media?.video),
      };

      if (mode === "direct") {
        const targetUserId = Number(raw?.targetUserId);
        if (!targetUserId || targetUserId === Number(actor.id)) {
          return socket.emit("call:error", { message: "invalid_target" });
        }
        const peer = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!peer || peer.isActive === false) return socket.emit("call:error", { message: "peer_not_found" });
        if (!isUserOnlineBySocket(targetUserId)) {
          return socket.emit("call:error", { message: "peer_offline" });
        }

        activeCalls.set(callId, {
          state: "ringing",
          mode: "direct",
          callerId: Number(actor.id),
          participantIds: new Set([Number(actor.id), targetUserId]),
          answeredIds: new Set([Number(actor.id)]),
          groupId: null,
          media,
        });

        emitToUser(targetUserId, "call:invite:recv", {
          callId,
          fromUser: { id: actor.id, username: actor.username },
          mode: "direct",
          groupId: null,
          media,
        });
        socket.emit("call:invite:sent", { callId, mode: "direct" });
        return;
      }

      const groupId = Number(raw?.groupId);
      if (!groupId) return socket.emit("call:error", { message: "missing_group" });
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return socket.emit("call:error", { message: "not_group_member" });

      const members = await prisma.groupChatMember.findMany({
        where: { groupId },
        select: { userId: true },
      });
      let memberIds = members.map((m) => Number(m.userId)).filter((id) => id !== Number(actor.id));
      if (memberIds.length > WEBRTC_CALL_MAX_GROUP_PEERS - 1) {
        memberIds = memberIds.slice(0, WEBRTC_CALL_MAX_GROUP_PEERS - 1);
      }
      const participantIds = new Set([Number(actor.id), ...memberIds]);
      activeCalls.set(callId, {
        state: "ringing",
        mode: "group",
        callerId: Number(actor.id),
        participantIds,
        answeredIds: new Set([Number(actor.id)]),
        groupId,
        media,
      });
      for (const uid of memberIds) {
        emitToUser(uid, "call:invite:recv", {
          callId,
          fromUser: { id: actor.id, username: actor.username },
          mode: "group",
          groupId,
          media,
        });
      }
      socket.emit("call:invite:sent", { callId, mode: "group", memberCount: memberIds.length });
    } catch (error) {
      console.error("call:invite", error);
      socket.emit("call:error", { message: "invite_failed" });
    }
  });

  socket.on("call:accept", (raw) => {
    const callId = String(raw?.callId || "").trim();
    const session = activeCalls.get(callId);
    if (!session) return socket.emit("call:error", { message: "call_not_found" });
    if (!session.participantIds.has(Number(actor.id))) return socket.emit("call:error", { message: "not_in_call" });
    if (!session.answeredIds) session.answeredIds = new Set([Number(session.callerId)]);
    session.answeredIds.add(Number(actor.id));
    session.state = "active";
    if (session.participantIds.size && session.answeredIds.size >= session.participantIds.size) {
      session.fullyAnsweredAtMs = Date.now();
    }
    const payload = {
      callId,
      acceptedBy: { id: actor.id, username: actor.username },
      participantIds: [...session.participantIds],
      answeredIds: [...session.answeredIds],
      mode: session.mode,
      groupId: session.groupId ?? null,
    };
    for (const pid of session.participantIds) {
      emitToUser(pid, "call:accepted", payload);
    }
  });

  socket.on("call:reject", (raw) => {
    const callId = String(raw?.callId || "").trim();
    const session = activeCalls.get(callId);
    if (!session) return;
    const uid = Number(actor.id);
    if (!session.participantIds.has(uid)) return;
    const answered = session.answeredIds ?? new Set([Number(session.callerId)]);
    /** Ignore reject from a duplicate tab/socket after this user already accepted (prevents bogus miss_reject). */
    if (answered.has(uid)) return;
    const reason = String(raw?.reason || "rejected");
    if (session.mode === "direct") {
      const callerId = Number(session.callerId);
      const calleeId = [...session.participantIds].find((id) => id !== callerId);
      if (callerId && calleeId) {
        const outcome = reason === "media_denied" ? "miss_media" : "miss_reject";
        void persistDirectCallMissLog({ callerId, calleeId, callId, outcome, reason, byUserId: uid });
      }
    }
    session.participantIds.delete(uid);
    for (const pid of session.participantIds) {
      emitToUser(pid, "call:rejected", { callId, byUserId: uid, reason });
    }
    activeCalls.delete(callId);
  });

  socket.on("call:end", (raw) => {
    const callId = String(raw?.callId || "").trim();
    const session = activeCalls.get(callId);
    if (!session) return;
    if (!session.participantIds.has(Number(actor.id))) return;
    const reason = String(raw?.reason || "hangup");
    const byUserId = Number(actor.id);
    if (session.mode === "direct") {
      const callerId = Number(session.callerId);
      const calleeId = [...session.participantIds].find((id) => id !== callerId);
      const answered = session.answeredIds ?? new Set([Number(session.callerId)]);
      const calleeAnswered = Boolean(calleeId && answered.has(calleeId));
      if (callerId && calleeId) {
        if (!calleeAnswered) {
          let outcome = "miss_hangup_ringing";
          if (reason === "cancelled") outcome = "miss_cancel";
          else if (reason === "hangup") outcome = "miss_hangup_ringing";
          else if (reason === "media_denied") outcome = "miss_media";
          else if (reason === "peer_disconnect") outcome = "miss_disconnect";
          void persistDirectCallMissLog({ callerId, calleeId, callId, outcome, reason, byUserId });
        } else {
          const durationSec =
            typeof session.fullyAnsweredAtMs === "number"
              ? Math.max(0, Math.round((Date.now() - session.fullyAnsweredAtMs) / 1000))
              : null;
          const connectedAt =
            typeof session.fullyAnsweredAtMs === "number"
              ? new Date(session.fullyAnsweredAtMs).toISOString()
              : null;
          void persistDirectCallMissLog({
            callerId,
            calleeId,
            callId,
            outcome: "call_ended",
            reason,
            byUserId,
            durationSec,
            connectedAt,
          });
        }
      }
    }
    for (const pid of session.participantIds) {
      emitToUser(pid, "call:end", { callId, reason, byUserId });
    }
    activeCalls.delete(callId);
  });

  socket.on("call:signal", (raw) => {
    const callId = String(raw?.callId || "").trim();
    const toUserId = Number(raw?.toUserId);
    const signal = raw?.signal;
    if (!callId || !toUserId || !signal || !signal.type) {
      return socket.emit("call:error", { message: "bad_signal" });
    }
    const session = activeCalls.get(callId);
    if (!session) return socket.emit("call:error", { message: "call_not_found" });
    const fromId = Number(actor.id);
    /** Never fall back to full participantIds — that would allow ICE before the callee has accepted. */
    const answered = session.answeredIds ?? new Set([Number(session.callerId)]);
    if (
      !session.participantIds.has(fromId) ||
      !session.participantIds.has(toUserId) ||
      !answered.has(fromId) ||
      !answered.has(toUserId)
    ) {
      return socket.emit("call:error", { message: "signal_not_allowed" });
    }
    emitToUser(toUserId, "call:signal:recv", { callId, fromUserId: fromId, signal });
  });

  socket.on("disconnect", () => {
    userLeaveCallSessions(actor.id);
    removeUserSocket(actor.id, socket.id);
    const stillConnected = userSocketIds.get(Number(actor.id));
    if (!stillConnected || stillConnected.size === 0) {
      io.emit("chat:presence", {
        userId: actor.id,
        username: actor.username,
        online: false,
      });
    }
  });
});

const checkPermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !PERMISSIONS[userRole]?.includes(permission)) {
      prisma.auditLog
        .create({
          data: {
            caseId: null,
            action: "ACCESS_DENIED_PERMISSION",
            notes: `permission=${permission}`,
            user: req.user?.username || "anonymous",
            details: JSON.stringify({
              method: req.method,
              path: req.originalUrl || req.url,
              role: userRole || null,
            }),
          },
        })
        .catch(() => {});
      return res.status(403).send("Insufficient permissions");
    }
    next();
  };
};

const hasPermission = (userRole, permission) => {
  if (!userRole) return false;
  return Boolean(PERMISSIONS[userRole]?.includes(permission));
};

const addUserSocket = (userId, socketId) => {
  const key = Number(userId);
  if (!userSocketIds.has(key)) {
    userSocketIds.set(key, new Set());
  }
  userSocketIds.get(key).add(socketId);
};

const removeUserSocket = (userId, socketId) => {
  const key = Number(userId);
  if (!userSocketIds.has(key)) return;
  const socketSet = userSocketIds.get(key);
  socketSet.delete(socketId);
  if (socketSet.size === 0) userSocketIds.delete(key);
};

const emitToUser = (userId, eventName, payload) => {
  const key = Number(userId);
  const socketSet = userSocketIds.get(key);
  if (!socketSet || socketSet.size === 0) return;
  for (const socketId of socketSet) {
    io.to(socketId).emit(eventName, payload);
  }
};

/** End active WebRTC call sessions involving this user (socket disconnect). */
function userLeaveCallSessions(userId) {
  const uid = Number(userId);
  if (!uid) return;
  for (const [callId, session] of [...activeCalls.entries()]) {
    if (!session?.participantIds?.has(uid)) continue;
    const participantsBefore = [...session.participantIds];
    const answered = session.answeredIds || new Set();
    const callerId = Number(session.callerId);
    const calleeId =
      session.mode === "direct" ? participantsBefore.find((id) => id !== callerId) : null;
    const calleeAnswered = calleeId && answered.has(calleeId);
    session.participantIds.delete(uid);
    const payload = { callId, reason: "peer_disconnect", leftUserId: uid };
    for (const pid of session.participantIds) {
      emitToUser(pid, "call:end", payload);
    }
    if (session.mode === "direct" && calleeId && callerId) {
      if (!calleeAnswered) {
        void persistDirectCallMissLog({
          callerId,
          calleeId,
          callId,
          outcome: "miss_disconnect",
          reason: "peer_disconnect",
          byUserId: uid,
        });
      } else {
        const durationSec =
          typeof session.fullyAnsweredAtMs === "number"
            ? Math.max(0, Math.round((Date.now() - session.fullyAnsweredAtMs) / 1000))
            : null;
        const connectedAt =
          typeof session.fullyAnsweredAtMs === "number"
            ? new Date(session.fullyAnsweredAtMs).toISOString()
            : null;
        void persistDirectCallMissLog({
          callerId,
          calleeId,
          callId,
          outcome: "call_ended",
          reason: "peer_disconnect",
          byUserId: uid,
          durationSec,
          connectedAt,
        });
      }
    }
    activeCalls.delete(callId);
  }
}

const isUserOnlineBySocket = (userId) => {
  const socketSet = userSocketIds.get(Number(userId));
  return Boolean(socketSet && socketSet.size > 0);
};

const DNO_DIRECT_CALL_LOG_MARKER = "__DNO_CALL_LOG__";

/**
 * Persist a 1:1 direct row when a call ends before both sides are connected (miss / cancel / reject / disconnect).
 * Message is from caller → callee; content is marker + JSON for UI + debugging.
 */
async function persistDirectCallMissLog({
  callerId,
  calleeId,
  callId,
  outcome,
  reason,
  byUserId,
  durationSec = null,
  connectedAt = null,
}) {
  const a = Number(callerId);
  const b = Number(calleeId);
  if (!a || !b || a === b) return;
  try {
    const [caller, callee] = await Promise.all([
      prisma.user.findUnique({ where: { id: a }, select: { username: true } }),
      prisma.user.findUnique({ where: { id: b }, select: { username: true } }),
    ]);
    if (!caller?.username || !callee?.username) return;

    let byDisplayName = null;
    if (byUserId != null && Number(byUserId)) {
      const who = await prisma.user.findUnique({
        where: { id: Number(byUserId) },
        select: { username: true, fullName: true },
      });
      byDisplayName = String(who?.fullName || who?.username || "").trim() || null;
    }

    const payload = {
      v: 2,
      outcome: String(outcome || ""),
      callId: String(callId || ""),
      reason: String(reason || ""),
      byUserId: byUserId != null ? Number(byUserId) : null,
      byDisplayName,
      durationSec: durationSec != null && Number.isFinite(Number(durationSec)) ? Number(durationSec) : null,
      connectedAt: connectedAt || null,
      at: new Date().toISOString(),
    };
    const content = `${DNO_DIRECT_CALL_LOG_MARKER}${JSON.stringify(payload)}`.slice(0, 2000);
    const receiverOnline = isUserOnlineBySocket(b);
    const created = await prisma.directMessage.create({
      data: {
        senderId: a,
        receiverId: b,
        content,
        deliveredAt: receiverOnline ? new Date() : null,
      },
    });
    const basePayload = {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt,
      deliveredAt: created.deliveredAt || null,
      readAt: created.readAt || null,
      editedAt: created.editedAt || null,
      isDeleted: Boolean(created.isDeleted),
      attachmentUrl: created.attachmentUrl || null,
      attachmentName: created.attachmentName || null,
      attachmentMime: created.attachmentMime || null,
      attachmentSize: created.attachmentSize || null,
      replyToMessageId: created.replyToMessageId || null,
      replyToSender: created.replyToSender || null,
      replyToSnippet: created.replyToSnippet || null,
      reactions: {},
      senderUsername: caller.username,
      receiverUsername: callee.username,
    };
    emitToUser(a, "chat:message", { ...basePayload, isMine: true });
    emitToUser(b, "chat:message", { ...basePayload, isMine: false });
  } catch (e) {
    console.error("persistDirectCallMissLog", e);
  }
}

const GROUP_MENTION_USERNAME_REGEX = /(^|\s)@([a-zA-Z0-9_.-]{3,120})/g;
const GROUP_MENTION_FULLNAME_REGEX = /@\{([^{}]{1,120})\}/g;
function extractMentionTargets(content = "") {
  const usernames = new Set();
  const fullNames = new Set();
  const text = String(content || "");
  let usernameMatch = GROUP_MENTION_USERNAME_REGEX.exec(text);
  while (usernameMatch) {
    const username = String(usernameMatch[2] || "").trim();
    if (username) usernames.add(username);
    usernameMatch = GROUP_MENTION_USERNAME_REGEX.exec(text);
  }
  let fullNameMatch = GROUP_MENTION_FULLNAME_REGEX.exec(text);
  while (fullNameMatch) {
    const fullName = String(fullNameMatch[1] || "").trim();
    if (fullName) fullNames.add(fullName.toLowerCase());
    fullNameMatch = GROUP_MENTION_FULLNAME_REGEX.exec(text);
  }
  return { usernames: [...usernames], fullNames: [...fullNames] };
}

async function getGroupMemberUserIds(groupId) {
  const rows = await prisma.groupChatMember.findMany({
    where: { groupId: Number(groupId) },
    select: { userId: true },
  });
  return rows.map((item) => Number(item.userId));
}
async function getActorAndGroupMembership(req, groupId) {
  const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
  if (!actor) return { actor: null, group: null, membership: null };
  const group = await prisma.groupChat.findUnique({ where: { id: Number(groupId) } });
  if (!group) return { actor, group: null, membership: null };
  const membership = await prisma.groupChatMember.findUnique({
    where: { groupId_userId: { groupId: Number(groupId), userId: actor.id } },
  });
  return { actor, group, membership };
}
function canManageGroup({ actor, group, membership }) {
  if (!actor || !group) return false;
  return Number(group.ownerId) === Number(actor.id) || Boolean(membership?.isAdmin);
}
function canTransferGroupOwnership({ actor, group }) {
  if (!actor || !group) return false;
  return Number(group.ownerId) === Number(actor.id);
}
async function createGroupManagementAuditLog({
  actorUsername,
  action,
  groupId,
  groupName = "",
  targetUsername = "",
  details = {},
}) {
  try {
    await prisma.auditLog.create({
      data: {
        caseId: null,
        action,
        notes: `group:${groupId}:${groupName || ""}`,
        user: actorUsername || "unknown",
        details: JSON.stringify({
          groupId: Number(groupId),
          groupName: String(groupName || ""),
          targetUsername: targetUsername ? String(targetUsername) : null,
          ...(details || {}),
        }),
      },
    });
  } catch (error) {
    console.error("Failed to write group audit log", error);
  }
}

const isLegacyActorLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    normalized === "legacy_data" ||
    normalized === "dữ liệu cũ" ||
    normalized === "du lieu cu" ||
    normalized.includes("?")
  );
};

async function createAccessAuditLog({ req, action, notes = "", details, caseId = null }) {
  await prisma.auditLog.create({
    data: {
      caseId,
      action,
      notes,
      user: req.user?.username || "anonymous",
      details: JSON.stringify({
        method: req.method,
        path: req.originalUrl || req.url,
        ...(details || {}),
      }),
    },
  });
}

// ================== LOGIN ==================
app.post(
  "/login",
  authLimiter,
  validateRequest([
    body("username").isString().trim().isLength({ min: 3, max: 120 }),
    body("password").isString().isLength({ min: 3, max: 128 }),
    body("captchaToken").optional().isString().isLength({ min: 20, max: 4096 }),
    body("captchaAnswer").optional().isString().isLength({ min: 1, max: 10 }),
  ]),
  async (req, res) => {
  const { username, password, captchaToken, captchaAnswer } = req.body;
  const clientIp = getClientIp(req);
  const normalizedLoginId = normalizeLoginId(username);
  const loginKey = `login:${normalizedLoginId}`;
  const ipKey = `ip:${clientIp}`;

  try {
    const matchedUser = await findUserByLoginId(username);
    const accountKey = matchedUser ? `username:${matchedUser.username}` : null;
    const guardKeys = [loginKey, ipKey, ...(accountKey ? [accountKey] : [])];
    const lockedUntil = await isAnyLoginLocked(guardKeys);
    if (lockedUntil) {
      return res
        .status(429)
        .send(`Too many failed attempts. Please retry after ${new Date(lockedUntil).toISOString()}`);
    }
    const requireCaptcha = await shouldRequireCaptcha(guardKeys);
    if (requireCaptcha && !verifyLoginCaptcha({ token: captchaToken, answer: captchaAnswer, loginId: username, ip: clientIp })) {
      const challenge = createLoginCaptchaChallenge({ loginId: username, ip: clientIp });
      return res.status(428).json({
        code: "CAPTCHA_REQUIRED",
        message: "Captcha required due to suspicious login attempts",
        captcha: challenge,
      });
    }
    const user = matchedUser;

    if (!user) {
      await trackLoginFailureByKey(loginKey);
      await trackLoginFailureByKey(ipKey);
      await prisma.auditLog.create({
        data: {
          caseId: null,
          action: "LOGIN_FAILED",
          notes: "User not found",
          user: normalizedLoginId || "unknown",
          details: JSON.stringify({ loginId: normalizedLoginId, ip: clientIp }),
        },
      });
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      });
    }
    if (!user.isActive) {
      await prisma.auditLog.create({
        data: {
          caseId: null,
          action: "LOGIN_DENIED_DISABLED",
          notes: "User disabled",
          user: user.username,
          details: JSON.stringify({ username: user.username, ip: clientIp }),
        },
      });
      return res.status(403).json({
        code: "USER_DISABLED",
        message: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
      });
    }
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      await trackLoginFailureByKey(loginKey);
      if (accountKey) await trackLoginFailureByKey(accountKey);
      await trackLoginFailureByKey(ipKey);
      await prisma.auditLog.create({
        data: {
          caseId: null,
          action: "LOGIN_FAILED",
          notes: "Invalid password",
          user: user.username,
          details: JSON.stringify({ username: user.username, ip: clientIp }),
        },
      });
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      });
    }
    if (user.mustChangePassword) {
      if (user.initialPasswordExpiresAt && new Date(user.initialPasswordExpiresAt) < new Date()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isActive: false },
        });
        await createUserSecurityAuditLog({
          actor: "system",
          action: "USER_AUTO_DISABLED_INITIAL_PASSWORD_EXPIRED",
          targetUsername: user.username,
          notes: "Initial password expired before first password change",
          details: { initialPasswordExpiresAt: user.initialPasswordExpiresAt },
        });
        return res.status(403).json({
          code: "INITIAL_PASSWORD_EXPIRED",
          message: "Mật khẩu khởi tạo đã hết hạn. Tài khoản tạm khóa, vui lòng liên hệ quản trị viên.",
        });
      }
      return res.status(403).json({
        code: "MUST_CHANGE_PASSWORD",
        message: "Bạn phải đổi mật khẩu ở lần đăng nhập đầu tiên",
        username: user.username,
      });
    }
    await ensurePasswordHashed(user, password);
    await clearLoginFailuresByKey(loginKey);
    if (accountKey) await clearLoginFailuresByKey(accountKey);
    const { accessToken, refreshToken } = await createAuthSession(user);
    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
});

app.post(
  "/auth/refresh",
  authLimiter,
  validateRequest([body("refreshToken").isString().isLength({ min: 20, max: 4096 })]),
  async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (decoded.type !== "refresh" || !decoded.sessionId || !decoded.username) {
      return res.status(403).send("Invalid refresh token");
    }

    const user = await prisma.user.findUnique({ where: { username: decoded.username } });
    if (!user) {
      return res.status(404).send("User not found");
    }

    const session = await prisma.session.findUnique({ where: { sessionId: decoded.sessionId } });
    if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(403).send("Refresh token expired");
    }

    const isTokenMatch = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!isTokenMatch) {
      return res.status(403).send("Refresh token mismatch");
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const { accessToken, refreshToken: nextRefreshToken } = await createAuthSession(user);
    res.json({
      token: accessToken,
      accessToken,
      refreshToken: nextRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName || "",
        email: user.email || "",
        phone: user.phone || "",
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (error) {
    return res.status(403).send("Invalid refresh token");
  }
});

app.post(
  "/auth/initial-password-change",
  authLimiter,
  validateRequest([
    body("username").isString().trim().isLength({ min: 3, max: 120 }),
    body("currentPassword").isString().isLength({ min: 3, max: 128 }),
    body("newPassword").isString().isLength({ min: 8, max: 128 }),
  ]),
  async (req, res) => {
    const loginId = normalizeLoginId(req.body.username);
    const { currentPassword, newPassword } = req.body;
    try {
      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
          code: "WEAK_PASSWORD",
          message: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ thường, chữ HOA, số và ký tự đặc biệt.",
        });
      }
      const user = await findUserByLoginId(loginId);
      if (!user) return res.status(404).send("User not found");
      if (!user.mustChangePassword) {
        return res.status(400).send("Tài khoản không ở trạng thái đổi mật khẩu bắt buộc");
      }
      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) return res.status(400).send("Mật khẩu tạm không đúng");
      await prisma.user.update({
        where: { username: user.username },
        data: {
          password: await hashPassword(newPassword),
          mustChangePassword: false,
          initialPasswordExpiresAt: null,
          isActive: true,
        },
      });
      await createUserSecurityAuditLog({
        actor: user.username,
        action: "USER_INITIAL_PASSWORD_CHANGED",
        targetUsername: user.username,
        notes: "User completed mandatory first-login password change",
      });
      await clearLoginFailuresByKey(`login:${loginId}`);
      await clearLoginFailuresByKey(`username:${user.username}`);
      return res.json({ message: "Đổi mật khẩu lần đầu thành công. Vui lòng đăng nhập lại." });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi đổi mật khẩu lần đầu");
    }
  }
);

app.post(
  "/auth/forgot-password",
  authLimiter,
  validateRequest([body("email").isEmail()]),
  async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    try {
      const user = await prisma.user.findFirst({
        where: { email },
      });
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });
        const resetLink = `${getAppBaseUrl()}/reset-password?token=${token}`;
        await sendPasswordResetEmail({ to: email, resetLink });
      }
      return res.json({
        message:
          "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi yêu cầu khôi phục mật khẩu");
    }
  }
);

app.post(
  "/auth/reset-password",
  authLimiter,
  validateRequest([
    body("token").isString().isLength({ min: 20, max: 200 }),
    body("newPassword").isString().isLength({ min: 8, max: 128 }),
  ]),
  async (req, res) => {
    const { token, newPassword } = req.body;
    try {
      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
          code: "WEAK_PASSWORD",
          message: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ thường, chữ HOA, số và ký tự đặc biệt.",
        });
      }
      const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
        return res.status(400).send("Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
      }

      const hashed = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashed },
      });
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
      await prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await prisma.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.json({ message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại." });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi đặt lại mật khẩu");
    }
  }
);

app.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.user.username },
      select: {
        id: true,
        username: true,
        role: true,
        fullName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) {
      return res.status(404).send("User not found");
    }
    const numericId = Number(user.id ?? req.user?.id) || Number(req.user?.id) || 0;
    return res.json({ ...user, id: numericId });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi lấy thông tin hồ sơ cá nhân");
  }
});

app.put(
  "/me",
  authenticateToken,
  validateRequest([
    body("fullName").optional({ checkFalsy: true }).isString().trim().isLength({ min: 2, max: 120 }),
    body("email").optional({ checkFalsy: true }).isEmail(),
    body("phone").optional({ checkFalsy: true }).isString().trim().isLength({ min: 8, max: 20 }),
    body("avatarUrl").optional({ nullable: true, checkFalsy: true }).isString().isLength({ min: 5, max: 500 }),
  ]),
  async (req, res) => {
    const { fullName, email, phone, avatarUrl } = req.body;
    try {
      const normalizedEmail =
        email !== undefined
          ? await ensureEmailUniqueOrThrow({ email, excludeUsername: req.user.username })
          : undefined;
      const updated = await prisma.user.update({
        where: { username: req.user.username },
        data: {
          fullName: fullName ?? undefined,
          email: normalizedEmail ?? undefined,
          phone: phone ?? undefined,
          avatarUrl: avatarUrl !== undefined ? avatarUrl || null : undefined,
        },
        select: {
          id: true,
          username: true,
          role: true,
          fullName: true,
          email: true,
          phone: true,
          avatarUrl: true,
        },
      });
      return res.json(updated);
    } catch (error) {
      if (error?.code === "EMAIL_ALREADY_IN_USE") {
        return res.status(409).json({
          code: "EMAIL_ALREADY_IN_USE",
          message: "Email đã được dùng bởi tài khoản khác.",
        });
      }
      console.error(error);
      return res.status(500).send("Lỗi cập nhật hồ sơ cá nhân");
    }
  }
);

app.post(
  "/me/avatar-upload",
  authenticateToken,
  avatarUpload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("Không tìm thấy ảnh hình đại diện");
      }
      const filename = `avatar-${Date.now()}-${path.basename(req.file.filename)}`;
      const fromPath = path.join(__dirname, "uploads", req.file.filename);
      const toPath = path.join(__dirname, "uploads", filename);
      fs.renameSync(fromPath, toPath);
      return res.json({
        avatarUrl: `${publicApiOrigin(req)}/avatars/${filename}`,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải hình đại diện");
    }
  }
);

app.put(
  "/me/password",
  authenticateToken,
  validateRequest([
    body("currentPassword").isString().isLength({ min: 3, max: 128 }),
    body("newPassword").isString().isLength({ min: 8, max: 128 }),
  ]),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
          code: "WEAK_PASSWORD",
          message: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ thường, chữ HOA, số và ký tự đặc biệt.",
        });
      }
      const user = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!user) {
        return res.status(404).send("User not found");
      }
      const valid = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        return res.status(400).send("Mật khẩu hiện tại không đúng");
      }
      const hashed = await hashPassword(newPassword);
      await prisma.user.update({
        where: { username: req.user.username },
        data: { password: hashed },
      });
      // Revoke all sessions to force re-login after password change.
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.json({ message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại." });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi đổi mật khẩu");
    }
  }
);

app.get("/me/report", authenticateToken, async (req, res) => {
  try {
    const myCases = await prisma.case.findMany({
      where: {
        assignedTo: req.user.username,
        isDeleted: false,
      },
      include: {
        files: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const openCases = myCases.filter((item) => item.status !== WORKFLOW_STATUS.ARCHIVED);
    const closedCases = myCases.filter((item) => item.status === WORKFLOW_STATUS.ARCHIVED);
    const overdueCases = openCases.filter((item) => item.deadline && new Date(item.deadline) < new Date());

    const byStatus = {};
    for (const caseItem of myCases) {
      byStatus[caseItem.status] = (byStatus[caseItem.status] || 0) + 1;
    }

    return res.json({
      kpi: {
        totalAssigned: myCases.length,
        openCases: openCases.length,
        closedCases: closedCases.length,
        overdueCases: overdueCases.length,
      },
      byStatus,
      recentCases: myCases.slice(0, 10),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi lấy báo cáo cá nhân");
  }
});

app.post(
  "/auth/logout",
  validateRequest([body("refreshToken").optional().isString().isLength({ min: 20, max: 4096 })]),
  async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.sendStatus(204);
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (decoded.sessionId) {
      await prisma.session.updateMany({
        where: { sessionId: decoded.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch (error) {
    // Ignore invalid refresh tokens on logout.
  }
  return res.sendStatus(204);
});

// ================== USER MANAGEMENT ==================
app.get("/users", authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        username: true,
        role: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        mustChangePassword: true,
        initialPasswordExpiresAt: true,
        isActive: true,
      },
    });
    const usernameKeys = users.map((item) => `username:${item.username}`);
    const attempts = usernameKeys.length
      ? await prisma.loginAttempt.findMany({
          where: { key: { in: usernameKeys } },
          select: { key: true, lockUntil: true, lockLevel: true, failCount: true },
        })
      : [];
    const lockMap = new Map(attempts.map((item) => [item.key, item]));
    const now = new Date();
    const usersWithLockState = users.map((item) => {
      const lockRow = lockMap.get(`username:${item.username}`);
      const isLocked = Boolean(lockRow?.lockUntil && new Date(lockRow.lockUntil) > now);
      return {
        ...item,
        fullName: String(item.fullName || item.username || "").trim(),
        isLoginLocked: isLocked,
        loginLockUntil: lockRow?.lockUntil || null,
        loginLockLevel: lockRow?.lockLevel || 0,
        loginFailCount: lockRow?.failCount || 0,
      };
    });
    res.json(usersWithLockState);
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi khi lấy danh sách người dùng");
  }
});

app.post(
  "/users/avatar-upload",
  authenticateToken,
  checkPermission("manage_users"),
  avatarUpload.single("avatar"),
  async (_req, res) => {
    try {
      if (!_req.file) {
        return res.status(400).send("Không tìm thấy ảnh hình đại diện");
      }
      const filename = `avatar-${Date.now()}-${path.basename(_req.file.filename)}`;
      const fromPath = path.join(__dirname, "uploads", _req.file.filename);
      const toPath = path.join(__dirname, "uploads", filename);
      fs.renameSync(fromPath, toPath);
      return res.json({
        avatarUrl: `${publicApiOrigin(_req)}/avatars/${filename}`,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải hình đại diện");
    }
  }
);

app.get("/templates", authenticateToken, async (_req, res) => {
  try {
    const templates = await prisma.documentTemplate.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return res.json(templates);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi lấy danh sách biểu mẫu");
  }
});

app.get(
  "/templates/:id",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const template = await prisma.documentTemplate.findUnique({ where: { id } });
      if (!template) return res.status(404).send("Template not found");
      return res.json(template);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi lấy chi tiết biểu mẫu");
    }
  }
);

app.post(
  "/templates",
  authenticateToken,
  validateRequest([
    body("name").isString().trim().isLength({ min: 3, max: 120 }),
    body("code").optional({ checkFalsy: true }).isString().trim().isLength({ min: 3, max: 40 }),
    body("category").isString().trim().isLength({ min: 2, max: 60 }),
    body("content").isString().isLength({ min: 10, max: 100000 }),
    body("sourceDocxPath").optional({ nullable: true }).isString().isLength({ min: 1, max: 300 }),
    body("sourceDocxName").optional({ nullable: true }).isString().isLength({ min: 1, max: 300 }),
    body("useSourceDocx").optional().isBoolean(),
  ]),
  async (req, res) => {
    const { name, code, category, content, sourceDocxPath = null, sourceDocxName = null, useSourceDocx } = req.body;
    try {
      if (!canCreateTemplate(req.user?.role)) return res.status(403).send("Insufficient permissions");
      const resolvedCode = String(code || "").trim().toUpperCase() || (await generateTemplateCode());
      const template = await prisma.$transaction(async (tx) => {
        const created = await tx.documentTemplate.create({
          data: {
            name,
            code: resolvedCode,
            category,
            content,
            sourceDocxPath,
            sourceDocxName,
            useSourceDocx: Boolean(useSourceDocx && sourceDocxPath),
            status: TEMPLATE_STATUS.DRAFT,
            isActive: false,
            createdBy: req.user.username,
          },
        });
        await tx.documentTemplateVersion.create({
          data: {
            templateId: created.id,
            version: created.version,
            name: created.name,
            category: created.category,
            content: created.content,
            sourceDocxPath: created.sourceDocxPath,
            sourceDocxName: created.sourceDocxName,
            useSourceDocx: created.useSourceDocx,
            status: created.status,
            changedBy: req.user.username,
          },
        });
        return created;
      });
      return res.status(201).json(template);
    } catch (error) {
      console.error(error);
      if (error?.code === "P2002") return res.status(409).send("Mã biểu mẫu đã tồn tại");
      return res.status(500).send("Lỗi tạo biểu mẫu");
    }
  }
);

app.put(
  "/templates/:id",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("name").optional().isString().trim().isLength({ min: 3, max: 120 }),
    body("category").optional().isString().trim().isLength({ min: 2, max: 60 }),
    body("content").optional().isString().isLength({ min: 10, max: 100000 }),
    body("isActive").optional().isBoolean(),
    body("status").optional().isIn(Object.values(TEMPLATE_STATUS)),
    body("sourceDocxPath").optional({ nullable: true }).isString().isLength({ min: 1, max: 300 }),
    body("sourceDocxName").optional({ nullable: true }).isString().isLength({ min: 1, max: 300 }),
    body("useSourceDocx").optional().isBoolean(),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { name, category, content, sourceDocxPath, sourceDocxName, useSourceDocx } = req.body;
    try {
      const existing = await prisma.documentTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).send("Template not found");
      const role = req.user?.role;
      const isOwner = existing.createdBy === req.user?.username;
      if (!isOwner && !canReviewTemplate(role) && !canApproveTemplate(role)) {
        return res.status(403).send("Insufficient permissions");
      }
      // Reviewer (not owner/admin) can only edit while template is under review.
      if (
        !isOwner &&
        canReviewTemplate(role) &&
        !canApproveTemplate(role) &&
        existing.status !== TEMPLATE_STATUS.UNDER_REVIEW
      ) {
        return res.status(403).send("Template can only be edited in review stage.");
      }
      const shouldIncreaseVersion = typeof content === "string" && content !== existing.content;
      const nextStatus =
        canReviewTemplate(role) || canApproveTemplate(role) ? existing.status : TEMPLATE_STATUS.DRAFT;
      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.documentTemplate.update({
          where: { id },
          data: {
            name: name ?? existing.name,
            category: category ?? existing.category,
            content: content ?? existing.content,
            ...(sourceDocxPath !== undefined && { sourceDocxPath: sourceDocxPath || null }),
            ...(sourceDocxName !== undefined && { sourceDocxName: sourceDocxName || null }),
            ...(useSourceDocx !== undefined && {
              useSourceDocx: Boolean(
                useSourceDocx &&
                  ((sourceDocxPath !== undefined ? sourceDocxPath : existing.sourceDocxPath) || null)
              ),
            }),
            status: nextStatus,
            isActive: nextStatus === TEMPLATE_STATUS.APPROVED,
            version: shouldIncreaseVersion ? existing.version + 1 : existing.version,
          },
        });
        if (shouldIncreaseVersion) {
          await tx.documentTemplateVersion.create({
            data: {
              templateId: saved.id,
              version: saved.version,
              name: saved.name,
              category: saved.category,
              content: saved.content,
              sourceDocxPath: saved.sourceDocxPath,
              sourceDocxName: saved.sourceDocxName,
              useSourceDocx: saved.useSourceDocx,
              status: saved.status,
              changedBy: req.user.username,
            },
          });
        }
        return saved;
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật biểu mẫu");
    }
  }
);

app.get(
  "/templates/:id/versions",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const existing = await prisma.documentTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).send("Template not found");
      const versions = await prisma.documentTemplateVersion.findMany({
        where: { templateId: id },
        orderBy: [{ version: "desc" }, { changedAt: "desc" }],
      });
      return res.json(versions);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Không thể lấy lịch sử phiên bản biểu mẫu");
    }
  }
);

app.post(
  "/templates/:id/restore/:versionId",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 }), param("versionId").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    const versionId = Number(req.params.versionId);
    try {
      const existing = await prisma.documentTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).send("Template not found");
      const role = req.user?.role;
      const isOwner = existing.createdBy === req.user?.username;
      if (!isOwner && !canReviewTemplate(role) && !canApproveTemplate(role)) {
        return res.status(403).send("Insufficient permissions");
      }
      const versionRow = await prisma.documentTemplateVersion.findFirst({
        where: { id: versionId, templateId: id },
      });
      if (!versionRow) return res.status(404).send("Template version not found");
      const restored = await prisma.$transaction(async (tx) => {
        const nextVersion = existing.version + 1;
        const saved = await tx.documentTemplate.update({
          where: { id },
          data: {
            name: versionRow.name,
            category: versionRow.category,
            content: versionRow.content,
            sourceDocxPath: versionRow.sourceDocxPath,
            sourceDocxName: versionRow.sourceDocxName,
            useSourceDocx: versionRow.useSourceDocx,
            // Restored content must go through review/approve again.
            status: TEMPLATE_STATUS.DRAFT,
            isActive: false,
            submittedAt: null,
            reviewedBy: null,
            reviewedAt: null,
            approvedBy: null,
            approvedAt: null,
            version: nextVersion,
          },
        });
        await tx.documentTemplateVersion.create({
          data: {
            templateId: saved.id,
            version: saved.version,
            name: saved.name,
            category: saved.category,
            content: saved.content,
            sourceDocxPath: saved.sourceDocxPath,
            sourceDocxName: saved.sourceDocxName,
            useSourceDocx: saved.useSourceDocx,
            status: saved.status,
            changedBy: req.user.username,
          },
        });
        return saved;
      });
      return res.json(restored);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Không thể khôi phục phiên bản biểu mẫu");
    }
  }
);

app.delete(
  "/templates/:id",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const existing = await prisma.documentTemplate.findUnique({ where: { id } });
      if (!existing) return res.status(404).send("Template not found");
      const role = req.user?.role;
      if (!canApproveTemplate(role) && existing.createdBy !== req.user?.username) {
        return res.status(403).send("Insufficient permissions");
      }
      await prisma.documentTemplate.delete({ where: { id } });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(404).send("Template not found");
    }
  }
);

app.post(
  "/templates/import-content",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    let keepUploadedFile = false;
    try {
      if (!req.file) return res.status(400).send("Thiếu tập tin import");
      const filePath = req.file.path;
      const originalName = String(req.file.originalname || "").toLowerCase();
      const mimeType = String(req.file.mimetype || "").toLowerCase();
      let content = "";
      let html = "";
      if (mimeType === "text/plain" || originalName.endsWith(".txt")) {
        content = fs.readFileSync(filePath, "utf8");
        html = content
          .split(/\r?\n/)
          .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p><br/></p>"))
          .join("");
        return res.json({
          content: (html || "").trim(),
          sourceDocxPath: null,
          sourceDocxName: null,
          useSourceDocx: false,
        });
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        originalName.endsWith(".docx")
      ) {
        const sourceBinary = fs.readFileSync(filePath, "binary");
        const sourceZip = new PizZip(sourceBinary);
        const detectedTokens = extractMustacheTokensFromZip(sourceZip);
        const hasTemplateAnchor = hasTemplateContentAnchorInZip(sourceZip);
        const [htmlResult, textResult] = await Promise.all([
          mammoth.convertToHtml({ path: filePath }),
          mammoth.extractRawText({ path: filePath }),
        ]);
        html = String(htmlResult?.value || "").trim();
        content = String(textResult?.value || "").trim();
        if (!html && content) {
          html = content
            .split(/\r?\n/)
            .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p><br/></p>"))
            .join("");
        }
        const sourceStoredName = `template-source-${Date.now()}-${path.basename(req.file.originalname)}`;
        const sourceTargetPath = path.join(__dirname, "uploads", sourceStoredName);
        fs.copyFileSync(filePath, sourceTargetPath);
        keepUploadedFile = true;
        return res.json({
          content: (html || "").trim(),
          sourceDocxPath: sourceStoredName,
          sourceDocxName: req.file.originalname,
          useSourceDocx: true,
          detectedTokens,
          hasTemplateAnchor,
        });
      } else {
      return res.status(415).send("Định dạng tập tin chưa được hỗ trợ. Chỉ nhận TXT/DOCX.");
      }
    } catch (error) {
      console.error(error);
      return res.status(500).send("Không thể nạp nội dung từ tập tin.");
    } finally {
      if (!keepUploadedFile && req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (_error) {}
      }
    }
  }
);

app.post(
  "/templates/preview-word",
  authenticateToken,
  validateRequest([
    body("content").isString().isLength({ min: 1, max: 200000 }),
    body("name").optional().isString().isLength({ min: 1, max: 120 }),
    body("sourceDocxPath").optional({ nullable: true }).isString().isLength({ min: 1, max: 300 }),
    body("previewData").optional({ nullable: true }).isObject(),
  ]),
  async (req, res) => {
    try {
      const content = String(req.body?.content || "").trim();
      const name = String(req.body?.name || "template").trim();
      const sourceDocxPath = String(req.body?.sourceDocxPath || "").trim();
      const previewPayload = {
        ...buildDefaultPreviewPayload(),
        ...(req.body?.previewData && typeof req.body.previewData === "object" ? req.body.previewData : {}),
      };
      const mergedHtml = interpolateTemplateHtml(content, previewPayload);
      const mergedText = htmlToPlainText(mergedHtml);
      const safeName = name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "template";
      let renderedDocx = null;
      if (sourceDocxPath) {
        const sourceAbsPath = path.join(__dirname, "uploads", path.basename(sourceDocxPath));
        if (fs.existsSync(sourceAbsPath)) {
          const sourceBinary = fs.readFileSync(sourceAbsPath, "binary");
          const sourceZip = new PizZip(sourceBinary);
          const hasSourcePlaceholders = hasMustachePlaceholdersInZip(sourceZip);
          const hasTemplateAnchor = hasTemplateContentAnchorInZip(sourceZip);
          if (!hasSourcePlaceholders && !hasTemplateAnchor) {
            return res.status(422).json({
              message:
                "File Word mẫu gốc chưa có placeholder {{...}} hoặc {{template.content}}. Không thể merge dữ liệu mà vẫn giữ định dạng gốc.",
              code: "SOURCE_DOCX_NO_PLACEHOLDER",
            });
          }
          if (hasSourcePlaceholders) {
            try {
              renderedDocx = renderSourceDocxWithDocxtemplater(sourceBinary, {
                ...previewPayload,
                template: {
                  content: mergedText,
                  contentText: mergedText,
                },
              });
            } catch (docxtemplaterError) {
              console.warn("Preview docxtemplater render fallback:", docxtemplaterError?.message || docxtemplaterError);
            }
          }
          if (!renderedDocx && hasTemplateAnchor) {
            try {
              replaceScalarPlaceholdersInZip(sourceZip, previewPayload);
              const replacedZip = replaceTemplateContentAnchorsInZip(sourceZip, mergedText).zip;
              renderedDocx = replacedZip.generate({ type: "nodebuffer" });
            } catch (error) {
              console.warn("Preview source-docx anchor fallback:", error?.message || error);
            }
          }
          if (!renderedDocx) {
            return res.status(422).json({
              message:
                "Không thể merge dữ liệu vào file Word mẫu gốc hiện tại mà vẫn giữ định dạng. Vui lòng kiểm tra placeholder trong file gốc.",
              code: "SOURCE_DOCX_RENDER_FAILED",
            });
          }
        }
      }
      if (!renderedDocx) {
        const htmlDocument = `<!doctype html><html><head><meta charset="utf-8"></head><body>${mergedHtml}</body></html>`;
        renderedDocx = htmlDocx.asBlob(htmlDocument);
        if (renderedDocx && typeof renderedDocx.arrayBuffer === "function") {
          const arr = await renderedDocx.arrayBuffer();
          renderedDocx = Buffer.from(arr);
        } else if (!Buffer.isBuffer(renderedDocx)) {
          renderedDocx = Buffer.from(renderedDocx);
        }
      }
      const storedFilename = `template-preview-${Date.now()}-${safeName}.docx`;
      const targetPath = path.join(__dirname, "uploads", storedFilename);
      fs.writeFileSync(targetPath, renderedDocx);
      return res.json({
        filename: storedFilename,
        url: `${publicApiOrigin(req)}/uploads/${storedFilename}`,
        mergedHtml,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Không thể tạo bản Word xem trước.");
    }
  }
);

app.post(
  "/templates/:id/submit-review",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).send("Template not found");
    if (existing.createdBy !== req.user?.username && !canReviewTemplate(req.user?.role)) {
      return res.status(403).send("Insufficient permissions");
    }
    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: { status: TEMPLATE_STATUS.UNDER_REVIEW, isActive: false, submittedAt: new Date() },
    });
    return res.json(updated);
  }
);

app.post(
  "/templates/:id/review",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!canReviewTemplate(req.user?.role)) return res.status(403).send("Insufficient permissions");
    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).send("Template not found");
    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: { status: TEMPLATE_STATUS.PENDING_APPROVAL, reviewedBy: req.user.username, reviewedAt: new Date() },
    });
    return res.json(updated);
  }
);

app.post(
  "/templates/:id/approve",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!canApproveTemplate(req.user?.role)) return res.status(403).send("Insufficient permissions");
    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).send("Template not found");
    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: {
        status: TEMPLATE_STATUS.APPROVED,
        isActive: true,
        approvedBy: req.user.username,
        approvedAt: new Date(),
      },
    });
    return res.json(updated);
  }
);

app.post(
  "/templates/:id/reject",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!canApproveTemplate(req.user?.role)) return res.status(403).send("Insufficient permissions");
    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).send("Template not found");
    const updated = await prisma.documentTemplate.update({
      where: { id },
      data: {
        status: TEMPLATE_STATUS.REJECTED,
        isActive: false,
        approvedBy: req.user.username,
        approvedAt: new Date(),
      },
    });
    await createNotificationForUsername({
      username: existing.createdBy,
      message: `Biểu mẫu "${existing.name}" đã bị từ chối và trả về để chỉnh sửa.`,
      type: "warning",
      actionUrl: "/templates",
    });
    return res.json(updated);
  }
);

app.get("/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    const [totalCases, archivedCases, activeCases, totalCustomers, allCases] = await Promise.all([
      prisma.case.count({ where: { isDeleted: false } }),
      prisma.case.count({ where: { status: WORKFLOW_STATUS.ARCHIVED } }),
      prisma.case.count({
        where: { isDeleted: false, status: { notIn: [WORKFLOW_STATUS.ARCHIVED, WORKFLOW_STATUS.CANCELLED] } },
      }),
      prisma.customer.count(),
      prisma.case.findMany({
        where: { isDeleted: false },
        select: { id: true, caseId: true, customerName: true, status: true, type: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const byStatus = Object.values(WORKFLOW_STATUS).reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});
    const byType = {};

    for (const caseItem of allCases) {
      byStatus[caseItem.status] = (byStatus[caseItem.status] || 0) + 1;
      byType[caseItem.type] = (byType[caseItem.type] || 0) + 1;
    }

    res.json({
      kpi: { totalCases, archivedCases, activeCases, totalCustomers },
      byStatus,
      byType,
      recentCases: allCases.slice(0, 10),
    });
    await createAccessAuditLog({
      req,
      action: "DASHBOARD_STATS_VIEWED",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi lấy thống kê bảng điều khiển");
  }
});

app.post(
  "/users",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    body("username").isString().trim().isLength({ min: 3, max: 64 }),
    body("email").isEmail(),
    body("fullName").optional().isString().trim().isLength({ min: 2, max: 120 }),
    body("role").isIn(Object.values(USER_ROLES)),
    body("avatarUrl").optional({ nullable: true }).isString().isLength({ min: 5, max: 500 }),
  ]),
  async (req, res) => {
    const { username, role, email, fullName, avatarUrl } = req.body;

    try {
      const normalizedUsername = normalizeUsername(username);
      const normalizedEmail = await ensureEmailUniqueOrThrow({ email });
      const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
      if (existing) {
        return res.status(409).json({
          code: "USERNAME_ALREADY_EXISTS",
          message: "Username đã tồn tại.",
        });
      }
      const tempPassword = generateTemporaryPassword(12);
      const hashedPassword = await hashPassword(tempPassword);
      const initialPasswordExpiresAt = getInitialPasswordExpiry();

      const normalizedFullName = String(fullName || "").trim() || normalizedUsername;
      const newUser = await prisma.user.create({
        data: {
          username: normalizedUsername,
          password: hashedPassword,
          role,
          email: normalizedEmail,
          fullName: normalizedFullName,
          avatarUrl: avatarUrl || null,
          mustChangePassword: true,
          initialPasswordExpiresAt,
          isActive: true,
        },
        select: {
          username: true,
          role: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          mustChangePassword: true,
          initialPasswordExpiresAt: true,
          isActive: true,
        },
      });
      const emailSent = await sendNewUserCredentialsEmail({
        to: normalizedEmail,
        username: normalizedUsername,
        temporaryPassword: tempPassword,
        expiresAt: initialPasswordExpiresAt,
      });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "USER_CREATED_WITH_TEMP_PASSWORD",
        targetUsername: normalizedUsername,
        notes: "Quản trị viên đã tạo người dùng với mật khẩu tạm được sinh tự động",
        details: {
          role,
          email: normalizedEmail,
          emailSent,
          initialPasswordExpiresAt,
        },
      });

      res.status(201).json({
        ...newUser,
        emailSent,
        temporaryPassword: emailSent ? undefined : tempPassword,
      });
    } catch (error) {
      if (error?.code === "EMAIL_ALREADY_IN_USE") {
        return res.status(409).json({
          code: "EMAIL_ALREADY_IN_USE",
          message: "Email đã được dùng bởi tài khoản khác.",
        });
      }
      console.error(error);
      res.status(500).send("Lỗi tạo user");
    }
  }
);

app.put(
  "/users/:username",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    param("username").isString().trim().isLength({ min: 3, max: 64 }),
    body("role").optional().isIn(Object.values(USER_ROLES)),
    body("password").optional().isString().isLength({ min: 8, max: 128 }),
    body("email").optional().isEmail(),
    body("fullName").optional().isString().trim().isLength({ min: 2, max: 120 }),
    body("isActive").optional().isBoolean(),
    body("avatarUrl").optional({ nullable: true }).isString().isLength({ min: 5, max: 500 }),
  ]),
  async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const { role, password, email, fullName, isActive, avatarUrl } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(404).send("User không tồn tại");
    }
    const normalizedEmail =
      email !== undefined
        ? await ensureEmailUniqueOrThrow({ email, excludeUsername: username })
        : undefined;

    const normalizedFullName =
      fullName !== undefined
        ? (String(fullName || "").trim() || username)
        : (String(user.fullName || "").trim() || username);
    const updated = await prisma.user.update({
      where: { username },
      data: {
        role: role ?? user.role,
        password: password ? await hashPassword(password) : user.password,
        email: normalizedEmail !== undefined ? normalizedEmail : user.email,
        fullName: normalizedFullName,
        avatarUrl: avatarUrl !== undefined ? avatarUrl || null : user.avatarUrl,
        mustChangePassword: password ? true : user.mustChangePassword,
        initialPasswordExpiresAt: password ? getInitialPasswordExpiry() : user.initialPasswordExpiresAt,
        isActive: typeof isActive === "boolean" ? isActive : user.isActive,
      },
      select: {
        username: true,
        role: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        mustChangePassword: true,
        initialPasswordExpiresAt: true,
        isActive: true,
      },
    });
    await createUserSecurityAuditLog({
      actor: req.user.username,
      action: "USER_UPDATED_BY_ADMIN",
      targetUsername: username,
      notes: "Quản trị viên đã cập nhật hồ sơ hoặc bảo mật người dùng",
      details: {
        changedRole: role !== undefined,
        changedPassword: Boolean(password),
        changedEmail: email !== undefined,
        changedFullName: fullName !== undefined,
        changedAvatar: avatarUrl !== undefined,
        changedIsActive: typeof isActive === "boolean",
        nextIsActive: updated.isActive,
        mustChangePassword: updated.mustChangePassword,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error?.code === "EMAIL_ALREADY_IN_USE") {
      return res.status(409).json({
        code: "EMAIL_ALREADY_IN_USE",
        message: "Email đã được dùng bởi tài khoản khác.",
      });
    }
    console.error(error);
    res.status(500).send("Lỗi cập nhật user");
  }
});

app.delete(
  "/users/:username",
  authenticateToken,
  checkPermission("manage_users"),
  async (req, res) => {
    const username = normalizeUsername(req.params.username);

    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        return res.status(404).send("User không tồn tại");
      }
      if (req.user?.username === username) {
        return res.status(400).send("Không thể tự xóa tài khoản đang đăng nhập");
      }

      await prisma.$transaction(async (tx) => {
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.notification.deleteMany({ where: { userId: user.id } });
        await tx.user.delete({ where: { username } });
      });

      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "USER_DELETED_BY_ADMIN",
        targetUsername: username,
        notes: "Quản trị viên đã xóa tài khoản người dùng",
      });
      res.sendStatus(204);
    } catch (error) {
      console.error(error);
      if (error?.code === "P2003") {
        return res.status(400).send("Không thể xóa user do còn ràng buộc dữ liệu");
      }
      return res.status(500).send("Lỗi xóa user");
    }
  }
);

app.post(
  "/users/:username/reissue-initial-password",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([param("username").isString().trim().isLength({ min: 3, max: 64 })]),
  async (req, res) => {
    const username = normalizeUsername(req.params.username);
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return res.status(404).send("User không tồn tại");
      if (!user.email) return res.status(400).send("User chưa có email để gửi mật khẩu");
      const temporaryPassword = generateTemporaryPassword(12);
      const updated = await prisma.user.update({
        where: { username },
        data: {
          password: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          initialPasswordExpiresAt: getInitialPasswordExpiry(),
          isActive: true,
        },
        select: { username: true, email: true, mustChangePassword: true, initialPasswordExpiresAt: true },
      });
      const emailSent = await sendNewUserCredentialsEmail({
        to: updated.email,
        username: updated.username,
        temporaryPassword,
        expiresAt: updated.initialPasswordExpiresAt,
      });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "USER_INITIAL_PASSWORD_REISSUED_BY_ADMIN",
        targetUsername: username,
        notes: "Quản trị viên đã cấp lại mật khẩu tạm cho lần đăng nhập đầu",
        details: {
          emailSent,
          initialPasswordExpiresAt: updated.initialPasswordExpiresAt,
        },
      });
      return res.json({
        message: "Đã cấp lại mật khẩu khởi tạo",
        emailSent,
        temporaryPassword: emailSent ? undefined : temporaryPassword,
        user: updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cấp lại mật khẩu khởi tạo");
    }
  }
);

app.post(
  "/users/:username/reissue-initial-password-no-email",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([param("username").isString().trim().isLength({ min: 3, max: 64 })]),
  async (req, res) => {
    const username = normalizeUsername(req.params.username);
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) return res.status(404).send("User không tồn tại");
      const temporaryPassword = generateTemporaryPassword(12);
      const updated = await prisma.user.update({
        where: { username },
        data: {
          password: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          initialPasswordExpiresAt: getInitialPasswordExpiry(),
          isActive: true,
        },
        select: { username: true, email: true, mustChangePassword: true, initialPasswordExpiresAt: true },
      });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "USER_INITIAL_PASSWORD_REISSUED_BY_ADMIN_NO_EMAIL",
        targetUsername: username,
        notes: "Quản trị viên đã cấp lại mật khẩu tạm không gửi qua email",
        details: {
          initialPasswordExpiresAt: updated.initialPasswordExpiresAt,
        },
      });
      return res.json({
        message: "Đã cấp lại mật khẩu tạm không cần email",
        temporaryPassword,
        user: updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cấp lại mật khẩu tạm không cần email");
    }
  }
);

app.post(
  "/users/:username/unlock-login",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([param("username").isString().trim().isLength({ min: 3, max: 64 })]),
  async (req, res) => {
    const username = normalizeUsername(req.params.username);
    try {
      await prisma.loginAttempt.updateMany({
        where: {
          OR: [{ key: `username:${username}` }],
        },
        data: {
          failCount: 0,
          firstAttemptAt: new Date(),
          lastAttemptAt: new Date(),
          lockUntil: null,
          lockLevel: 0,
        },
      });
      await createNotificationForUsername({
        username,
        message: "Tài khoản của bạn đã được quản trị viên mở khóa đăng nhập",
        type: "info",
        actionUrl: null,
      });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "USER_LOGIN_UNLOCKED_BY_ADMIN",
        targetUsername: username,
        notes: "Quản trị viên đã mở khóa trạng thái đăng nhập bị khóa tạm thời",
      });
      return res.json({ message: "Đã mở khóa đăng nhập cho người dùng" });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi mở khóa đăng nhập");
    }
  }
);

app.get(
  "/admin/audit-logs",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    query("limit").optional().isInt({ min: 1, max: 500 }),
    query("scope").optional().isIn(["all", "case", "user"]),
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("actor").optional().isString().isLength({ min: 1, max: 64 }),
    query("action").optional().isString().isLength({ min: 1, max: 120 }),
    query("caseId").optional().isInt({ min: 1 }),
    query("search").optional().isString().isLength({ min: 1, max: 120 }),
  ]),
  async (req, res) => {
    const limit = Number(req.query.limit || 50);
    const scope = String(req.query.scope || "all");
    try {
      const where = buildAuditLogWhereClause({
        scope,
        from: req.query.from,
        to: req.query.to,
        actor: req.query.actor,
        action: req.query.action,
        caseId: req.query.caseId,
        search: req.query.search,
      });
      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit,
      });
      await createAccessAuditLog({
        req,
        action: "AUDIT_LOGS_VIEWED",
        details: { scope, limit },
      });
      return res.json(logs.map(normalizeAuditLogRow));
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi lấy nhật ký kiểm toán bảo mật");
    }
  }
);

app.get(
  "/admin/audit-logs/export",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    query("format").isIn(["csv", "pdf"]),
    query("scope").optional().isIn(["all", "case", "user"]),
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("actor").optional().isString().isLength({ min: 1, max: 64 }),
    query("action").optional().isString().isLength({ min: 1, max: 120 }),
    query("caseId").optional().isInt({ min: 1 }),
    query("search").optional().isString().isLength({ min: 1, max: 120 }),
  ]),
  async (req, res) => {
    const format = String(req.query.format || "csv");
    const scope = String(req.query.scope || "all");
    try {
      const where = buildAuditLogWhereClause({
        scope,
        from: req.query.from,
        to: req.query.to,
        actor: req.query.actor,
        action: req.query.action,
        caseId: req.query.caseId,
        search: req.query.search,
      });
      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: 5000,
      });
      const rows = logs.map(normalizeAuditLogRow);
      const stamp = getVietnamDateStamp();
      await createAccessAuditLog({
        req,
        action: "AUDIT_LOGS_EXPORTED",
        notes: format,
        details: { scope, count: rows.length },
      });

      if (format === "csv") {
        const csvRows = [
          ["Timestamp", "Action", "Actor", "CaseId", "TargetUsername", "Notes", "Details"],
          ...rows.map((item) => [
            new Date(item.timestamp).toISOString(),
            item.action,
            item.actor,
            item.caseId ?? "",
            item.targetUsername || "",
            item.notes || "",
            JSON.stringify(item.details || {}),
          ]),
        ];
        const csv = toCsvString(csvRows);
        const buffer = Buffer.from(`\uFEFF${csv}`, "utf8");
        return sendDownloadWithHash(res, {
          filename: `AuditLogs_${scope}_${stamp}.csv`,
          contentType: "text/csv; charset=utf-8",
          buffer,
        });
      }

      const chunks = [];
      const doc = new PDFDocument({ margin: 30, size: "A4" });
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const buffer = Buffer.concat(chunks);
        sendDownloadWithHash(res, {
          filename: `AuditLogs_${scope}_${stamp}.pdf`,
          contentType: "application/pdf",
          buffer,
        });
      });
      doc.fontSize(14).text(`Audit Logs (${scope})`, { align: "left" });
      doc.moveDown(0.5);
      doc.fontSize(9).text(`Generated at: ${new Date().toISOString()}`);
      doc.moveDown(0.8);
      rows.slice(0, 300).forEach((item, index) => {
        const line =
          `${index + 1}. ${new Date(item.timestamp).toISOString()} | ${item.action} | actor=${item.actor}` +
          ` | case=${item.caseId ?? "-"} | target=${item.targetUsername || "-"} | notes=${item.notes || "-"}`;
        doc.fontSize(8).text(line, { width: 535 });
        doc.moveDown(0.2);
      });
      doc.end();
      return;
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xuất nhật ký kiểm toán");
    }
  }
);

app.get(
  "/reports/enterprise/export",
  authenticateToken,
  validateRequest([
    query("type").isIn(["operations", "staff", "finance", "legal"]),
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("lang").optional().isIn(["vi", "en"]),
  ]),
  async (req, res) => {
    const type = String(req.query.type);
    const lang = String(req.query.lang || "vi").toLowerCase() === "en" ? "en" : "vi";
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const stamp = getVietnamDateStamp();
    try {
      const role = req.user?.role;
      const allowed = ENTERPRISE_REPORT_ACCESS[role] || [];
      if (!allowed.includes(type)) {
        await createAccessAuditLog({
          req,
          action: "REPORT_EXPORT_DENIED",
          notes: `enterprise:${type}`,
          details: { role, type },
        });
        return res.status(403).send("Insufficient permissions for this report");
      }
      const where = { isDeleted: false };
      if (from || to) {
        where.updatedAt = {};
        if (from) where.updatedAt.gte = from;
        if (to) where.updatedAt.lte = to;
      }
      const cases = await prisma.case.findMany({
        where,
        include: { files: true },
        orderBy: { updatedAt: "desc" },
      });

      const yesText = lang === "en" ? "Y" : "Có";
      const noText = lang === "en" ? "N" : "Không";
      let rows = [];
      let filename =
        lang === "en" ? `EnterpriseReport_${type}_${stamp}.csv` : `BaoCaoTongHop_${type}_${stamp}.csv`;
      if (type === "operations") {
        rows = [
          lang === "en"
            ? ["CaseId", "Customer", "Type", "Status", "AssignedTo", "UpdatedAt", "HasDeadline", "IsOverdue"]
            : ["Mã hồ sơ", "Khách hàng", "Nghiệp vụ", "Trạng thái", "Phân công", "Cập nhật lúc", "Có hạn xử lý", "Quá hạn"],
          ...cases.map((item) => {
            const isOverdue =
              item.deadline &&
              new Date(item.deadline) < new Date() &&
              ![WORKFLOW_STATUS.ARCHIVED, WORKFLOW_STATUS.CANCELLED].includes(item.status);
            return [
              item.caseId,
              item.customerName,
              toCaseTypeLabelByLang(item.type, lang),
              toWorkflowStatusLabelByLang(item.status, lang),
              item.assignedTo || "",
              item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
              item.deadline ? yesText : noText,
              isOverdue ? yesText : noText,
            ];
          }),
        ];
        filename = lang === "en" ? `OperationsReport_${stamp}.csv` : `BaoCaoVanHanh_${stamp}.csv`;
      } else if (type === "staff") {
        const summary = {};
        for (const item of cases) {
          const key = item.assignedTo || "unassigned";
          if (!summary[key]) {
            summary[key] = { total: 0, open: 0, closed: 0, overdue: 0 };
          }
          summary[key].total += 1;
          if (item.status === WORKFLOW_STATUS.ARCHIVED) summary[key].closed += 1;
          else summary[key].open += 1;
          if (
            item.deadline &&
            new Date(item.deadline) < new Date() &&
            ![WORKFLOW_STATUS.ARCHIVED, WORKFLOW_STATUS.CANCELLED].includes(item.status)
          ) {
            summary[key].overdue += 1;
          }
        }
        rows = [
          lang === "en"
            ? ["Assignee", "TotalCases", "OpenCases", "ClosedCases", "OverdueCases"]
            : ["Nhân sự", "Tổng hồ sơ", "Đang xử lý", "Đã đóng", "Quá hạn"],
          ...Object.entries(summary).map(([assignee, stats]) => [
            assignee,
            stats.total,
            stats.open,
            stats.closed,
            stats.overdue,
          ]),
        ];
        filename = lang === "en" ? `StaffPerformance_${stamp}.csv` : `BaoCaoNhanSu_${stamp}.csv`;
      } else if (type === "finance") {
        rows = [
          lang === "en"
            ? [
                "CaseId",
                "Customer",
                "Type",
                "Status",
                "FeeAmount",
                "FeePaid",
                "FeeOutstanding",
                "ReceiptNo",
                "PaymentMethod",
                "UpdatedAt",
              ]
            : [
                "Mã hồ sơ",
                "Khách hàng",
                "Nghiệp vụ",
                "Trạng thái",
                "Phí phải thu",
                "Đã thu",
                "Còn lại",
                "Số phiếu thu",
                "Phương thức thu",
                "Cập nhật lúc",
              ],
          ...cases.map((item) => {
            const feeAmount = Number(item.feeAmount || 0);
            const feePaid = Number(item.feePaid || 0);
            return [
              item.caseId,
              item.customerName,
              toCaseTypeLabelByLang(item.type, lang),
              toWorkflowStatusLabelByLang(item.status, lang),
              feeAmount,
              feePaid,
              Math.max(0, feeAmount - feePaid),
              item.feeReceiptNo || "",
              toPaymentMethodLabelByLang(item.paymentMethod || PAYMENT_METHODS.CASH, lang),
              item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
            ];
          }),
        ];
        filename = lang === "en" ? `FinanceReport_${stamp}.csv` : `BaoCaoTaiChinh_${stamp}.csv`;
      } else if (type === "legal") {
        const copyRequests = await prisma.copyIssuanceRequest.findMany({
          where:
            from || to
              ? {
                  createdAt: {
                    ...(from && { gte: from }),
                    ...(to && { lte: to }),
                  },
                }
              : undefined,
          include: { case: { select: { caseId: true, customerName: true, caseCategory: true } } },
          orderBy: { createdAt: "desc" },
        });
        const inheritanceCases = cases.filter(
          (c) => c.caseCategory === CASE_CATEGORIES.INHERITANCE
        );
        const certificationCases = cases.filter(
          (c) => c.caseCategory === CASE_CATEGORIES.CERTIFICATION
        );
        const authorizationCases = cases.filter(
          (c) => c.caseCategory === CASE_CATEGORIES.AUTHORIZATION
        );

        const label = {
          inheritance: lang === "en" ? "Inheritance" : "Thừa kế",
          certification: lang === "en" ? "Certification" : "Chứng thực",
          authorization: lang === "en" ? "Authorization" : "Ủy quyền",
          copyIssuance: lang === "en" ? "CopyIssuance" : "Cấp bản sao",
          archival: lang === "en" ? "Archival" : "Lưu trữ",
          totalCases: lang === "en" ? "TotalCases" : "Tổng hồ sơ",
          postingPending: lang === "en" ? "PostingPending" : "Niêm yết chờ kết quả",
          postingNoClaim: lang === "en" ? "PostingNoClaim" : "Niêm yết không khiếu nại",
          postingHasClaim: lang === "en" ? "PostingHasClaim" : "Niêm yết có khiếu nại",
          certCopy: lang === "en" ? "Copy" : "Sao y",
          certSignature: lang === "en" ? "Signature" : "Chữ ký",
          certTranslatorSignature: lang === "en" ? "TranslatorSignature" : "Chữ ký người dịch",
          authContract: lang === "en" ? "ContractTwoParty" : "Hợp đồng ủy quyền",
          authLetter: lang === "en" ? "Letter" : "Giấy ủy quyền",
          total: lang === "en" ? "Total" : "Tổng",
          pending: lang === "en" ? "Pending" : "Chờ xử lý",
          approved: lang === "en" ? "Approved" : "Đã duyệt",
          rejected: lang === "en" ? "Rejected" : "Từ chối",
          issued: lang === "en" ? "Issued" : "Đã cấp",
          retentionConfigured: lang === "en" ? "RetentionConfigured" : "Đã cấu hình hạn lưu",
        };
        rows = [
          lang === "en" ? ["Section", "Metric", "Value", "Detail"] : ["Nhóm", "Chỉ số", "Giá trị", "Chi tiết"],
          [label.inheritance, label.totalCases, inheritanceCases.length, ""],
          [
            label.inheritance,
            label.postingPending,
            inheritanceCases.filter(
              (c) => c.inheritancePostingResult === INHERITANCE_POSTING_RESULTS.PENDING
            ).length,
            "",
          ],
          [
            label.inheritance,
            label.postingNoClaim,
            inheritanceCases.filter(
              (c) => c.inheritancePostingResult === INHERITANCE_POSTING_RESULTS.NO_CLAIM
            ).length,
            "",
          ],
          [
            label.inheritance,
            label.postingHasClaim,
            inheritanceCases.filter(
              (c) => c.inheritancePostingResult === INHERITANCE_POSTING_RESULTS.HAS_CLAIM
            ).length,
            "",
          ],
          [label.certification, label.totalCases, certificationCases.length, ""],
          [
            label.certification,
            label.certCopy,
            certificationCases.filter((c) => c.certificationKind === CERTIFICATION_KINDS.COPY)
              .length,
            "",
          ],
          [
            label.certification,
            label.certSignature,
            certificationCases.filter(
              (c) => c.certificationKind === CERTIFICATION_KINDS.SIGNATURE
            ).length,
            "",
          ],
          [
            label.certification,
            label.certTranslatorSignature,
            certificationCases.filter(
              (c) => c.certificationKind === CERTIFICATION_KINDS.TRANSLATOR_SIGNATURE
            ).length,
            "",
          ],
          [label.authorization, label.totalCases, authorizationCases.length, ""],
          [
            label.authorization,
            label.authContract,
            authorizationCases.filter(
              (c) => c.authorizationKind === AUTHORIZATION_KINDS.CONTRACT
            ).length,
            "",
          ],
          [
            label.authorization,
            label.authLetter,
            authorizationCases.filter((c) => c.authorizationKind === AUTHORIZATION_KINDS.LETTER)
              .length,
            "",
          ],
          [label.copyIssuance, label.total, copyRequests.length, ""],
          [
            label.copyIssuance,
            label.pending,
            copyRequests.filter((r) => r.status === "PENDING").length,
            "",
          ],
          [
            label.copyIssuance,
            label.approved,
            copyRequests.filter((r) => r.status === "APPROVED").length,
            "",
          ],
          [
            label.copyIssuance,
            label.rejected,
            copyRequests.filter((r) => r.status === "REJECTED").length,
            "",
          ],
          [
            label.copyIssuance,
            label.issued,
            copyRequests.filter((r) => r.status === "ISSUED").length,
            "",
          ],
          [
            label.archival,
            label.retentionConfigured,
            cases.filter((c) => c.archivalRetentionUntil).length,
            lang === "en"
              ? `${ARCHIVE_RETENTION_YEARS} years policy`
              : `Chính sách lưu trữ ${ARCHIVE_RETENTION_YEARS} năm`,
          ],
        ];
        filename = lang === "en" ? `LegalComplianceReport_${stamp}.csv` : `BaoCaoTuanThuPhapLy_${stamp}.csv`;
      }

      const csv = toCsvString(rows);
      const buffer = Buffer.from(`\uFEFF${csv}`, "utf8");
      await createAccessAuditLog({
        req,
        action: "REPORT_EXPORTED",
        notes: `enterprise:${type}`,
        details: { type, from: req.query.from || null, to: req.query.to || null },
      });
      return sendDownloadWithHash(res, {
        filename,
        contentType: "text/csv; charset=utf-8",
        buffer,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xuất báo cáo tổng hợp");
    }
  }
);

// ================== TEST ==================
app.get("/", (req, res) => {
  res.send("Backend running ??");
});

// ================== CASE MANAGEMENT ==================
app.post(
  "/ocr/cccd",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("Không tìm thấy file CCCD");
      }

      const extracted = parseMockOcrFromFilename(req.file.originalname);
      return res.json({
        message: "OCR thành công",
        data: {
          idNumber: extracted.idNumber || "",
          fullName: extracted.fullName || "",
          dateOfBirth: extracted.dateOfBirth || "",
          source: extracted.source,
          filename: req.file.originalname,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi OCR CCCD");
    }
  }
);

app.post(
  "/cases",
  authenticateToken,
  checkPermission("create_case"),
  validateRequest([
    body("customerId").optional().isInt({ min: 1 }),
    body("customerName").isString().trim().isLength({ min: 2, max: 120 }),
    body("phone").optional().isString().trim().isLength({ max: 20 }),
    body("type").isIn(CASE_TYPE_OPTIONS),
    body("description").optional().isString().isLength({ max: 5000 }),
    body("notes").optional().isString().isLength({ max: 5000 }),
    body("email").optional().isEmail(),
    body("idNumber").optional().isString().isLength({ max: 20 }),
    body("address").optional().isString().isLength({ max: 250 }),
    body("caseCategory").optional().isIn(Object.values(CASE_CATEGORIES)),
    body("authorizationKind").optional().isIn(Object.values(AUTHORIZATION_KINDS)),
    body("certificationKind").optional().isIn(Object.values(CERTIFICATION_KINDS)),
  ]),
  async (req, res) => {
    const {
      customerId,
      customerName,
      phone,
      type,
      description,
      notes,
      email,
      idNumber,
      address,
      caseCategory,
      authorizationKind,
      certificationKind,
    } = req.body;

    if (!customerName || !type) {
      return res.status(400).send("Thiếu thông tin khách hàng hoặc loại giao dịch");
    }

    let resolvedCategory = caseCategory || null;
    if (!resolvedCategory) {
      if (type === "Ủy quyền") resolvedCategory = CASE_CATEGORIES.AUTHORIZATION;
      else if (type === "Thừa kế") resolvedCategory = CASE_CATEGORIES.INHERITANCE;
      else if (type === "Di chúc") resolvedCategory = CASE_CATEGORIES.WILL;
      else if (type === "Chứng thực") resolvedCategory = CASE_CATEGORIES.CERTIFICATION;
      else resolvedCategory = CASE_CATEGORIES.CONTRACT;
    }

    if (resolvedCategory === CASE_CATEGORIES.AUTHORIZATION && !authorizationKind) {
      return res.status(400).send("Thiếu loại ủy quyền (hợp đồng/giấy ủy quyền)");
    }
    if (resolvedCategory === CASE_CATEGORIES.CERTIFICATION && !certificationKind) {
      return res.status(400).send("Thiếu loại chứng thực (sao y/chữ ký/chữ ký người dịch)");
    }

    try {
      let linkedCustomerId = null;

      if (customerId) {
        // Link to existing customer
        const customer = await prisma.customer.findUnique({
          where: { id: Number(customerId) },
        });

        if (customer) {
          linkedCustomerId = customer.id;
          await prisma.customer.update({
            where: { id: customer.id },
            data: { totalCases: { increment: 1 } },
          });
        }
      } else if (customerName) {
        // Auto-create new customer if not linked
        const duplicateCustomer = await findDuplicateCustomerByPhoneOrIdNumber({
          phone: phone || "",
          idNumber: idNumber || "",
        });
        if (duplicateCustomer) {
          return res.status(400).json({
            message: "Đã tồn tại khách hàng có số điện thoại hoặc CCCD trùng.",
            duplicateCustomer,
          });
        }
        const newCustomer = await prisma.customer.create({
          data: {
            customerId: `KH-${Date.now()}`,
            fullName: customerName,
            phone: phone || "",
            email: email || "",
            idNumber: idNumber || "",
            address: address || "",
            notes: "",
            totalCases: 1,
          },
        });
        linkedCustomerId = newCustomer.id;
      }

      const generatedCaseId = await generateCaseCode();
      const generatedPublicTrackingCode = await generateUniquePublicTrackingCode();
      const newCase = await prisma.case.create({
        data: {
          caseId: generatedCaseId,
          customerId: linkedCustomerId,
          customerName,
          phone: phone || "",
          type,
          caseCategory: resolvedCategory,
          authorizationKind:
            resolvedCategory === CASE_CATEGORIES.AUTHORIZATION ? authorizationKind : null,
          certificationKind:
            resolvedCategory === CASE_CATEGORIES.CERTIFICATION ? certificationKind : null,
          description: description || "",
          notes: notes || "",
          status: WORKFLOW_STATUS.RECEIVED,
          publicTrackingCode: generatedPublicTrackingCode,
          publicTrackingEnabled: false,
          assignedTo: null,
          files: { create: [] },
          history: {
            create: {
              action: "CREATED",
              fromStatus: null,
              toStatus: WORKFLOW_STATUS.RECEIVED,
              notes: `Phân loại: ${resolvedCategory}`,
              user: req.user.username,
              details: JSON.stringify({
                category: resolvedCategory,
                authorizationKind: authorizationKind || null,
                certificationKind: certificationKind || null,
              }),
            },
          },
        },
        include: { files: true, history: true },
      });
      const accountants = await prisma.user.findMany({
        where: { role: USER_ROLES.ACCOUNTANT, isActive: true },
        select: { username: true },
      });
      await Promise.all(
        accountants.map((item) =>
          createNotificationForUsername({
            username: item.username,
            caseId: newCase.id,
            message: `Hồ sơ mới ${newCase.caseId} cần tiếp nhận phiếu thu.`,
            type: "info",
            actionUrl: `/cases/${newCase.id}`,
          })
        )
      );

      res.status(201).json(newCase);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi tạo hồ sơ");
    }
  }
);

app.get("/cases", authenticateToken, async (req, res) => {
  try {
    const includeDeleted = req.user?.role === USER_ROLES.ADMIN && req.query.includeDeleted === "1";
    const role = req.user?.role;
    let whereClause = includeDeleted ? undefined : { isDeleted: false };
    if (role === USER_ROLES.NOTARY_OFFICER) {
      whereClause = {
        ...(includeDeleted ? {} : { isDeleted: false }),
        NOT: {
          status: { in: [WORKFLOW_STATUS.RECEIVED, WORKFLOW_STATUS.RECEIPT] },
        },
      };
    }
    const cases = await prisma.case.findMany({
      where: whereClause,
      include: { files: true, history: true },
    });
    res.json(cases);
    await createAccessAuditLog({
      req,
      action: "CASES_VIEWED",
      details: { count: cases.length, includeDeleted },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi khi lấy danh sách hồ sơ");
  }
});

app.get("/cases/:id", authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const includeDeleted = req.user?.role === USER_ROLES.ADMIN && req.query.includeDeleted === "1";
    const caseItem = await prisma.case.findUnique({
      where: { id },
      include: { files: true, history: true },
    });
    if (!caseItem || (caseItem.isDeleted && !includeDeleted)) {
      return res.status(404).send("Case not found");
    }
    if (
      req.user?.role === USER_ROLES.NOTARY_OFFICER &&
      [WORKFLOW_STATUS.RECEIVED, WORKFLOW_STATUS.RECEIPT].includes(caseItem.status)
    ) {
      return res.status(403).send("Insufficient permissions to view this case at current status");
    }
    res.json(caseItem);
    await createAccessAuditLog({
      req,
      action: "CASE_DETAIL_VIEWED",
      caseId: caseItem.id,
      details: { includeDeleted },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi khi lấy chi tiết hồ sơ");
  }
});

app.get(
  "/cases/:id/receipts",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({ where: { id }, select: { id: true } });
      if (!caseItem) return res.status(404).send("Case not found");
      const receipts = await prisma.receipt.findMany({
        where: { caseId: id },
        orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
      });
      return res.json(receipts);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi lấy danh sách phiếu thu");
    }
  }
);

app.get(
  "/receipts",
  authenticateToken,
  checkPermission("manage_receipts"),
  validateRequest([
    query("caseId").optional().isInt({ min: 1 }),
    query("q").optional().isString().isLength({ min: 1, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const caseId = req.query.caseId ? Number(req.query.caseId) : null;
      const q = String(req.query.q || "").trim();
      const receipts = await prisma.receipt.findMany({
        where: {
          ...(caseId && { caseId }),
          ...(q && {
            OR: [
              { receiptNo: { contains: q } },
              { collectedBy: { contains: q } },
              { case: { caseId: { contains: q } } },
              { case: { customerName: { contains: q } } },
            ],
          }),
        },
        include: {
          case: { select: { id: true, caseId: true, customerName: true, feeAmount: true, feePaid: true } },
        },
        orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
      });
      return res.json(receipts);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi lấy danh sách phiếu thu");
    }
  }
);

app.post(
  "/receipts",
  authenticateToken,
  checkPermission("manage_receipts"),
  validateRequest([
    body("caseId").isInt({ min: 1 }),
    body("amount").isFloat({ min: 1 }),
    body("paymentMethod").optional().isIn(Object.values(PAYMENT_METHODS)),
    body("collectedAt").optional().isISO8601(),
    body("note").optional().isString().isLength({ max: 500 }),
    body("receiptNo").optional().isString().trim().isLength({ min: 3, max: 50 }),
  ]),
  async (req, res) => {
    const {
      caseId,
      amount,
      paymentMethod = PAYMENT_METHODS.CASH,
      collectedAt,
      note = "",
      receiptNo,
    } = req.body;
    try {
      const caseItem = await prisma.case.findUnique({ where: { id: Number(caseId) } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!ensureCaseAssignmentAccess(req, res, caseItem, { allowCoordinator: true, allowAccountant: true })) return;
      const nextAmount = Number(amount || 0);
      const feeAmount = Number(caseItem.feeAmount || 0);
      const feePaid = Number(caseItem.feePaid || 0);
      if (feeAmount > 0 && feePaid + nextAmount > feeAmount) {
        return res.status(400).send("Số tiền phiếu thu vượt quá Tổng chi phí của hồ sơ.");
      }
      const thresholdError = validateFeeThresholdForStatus(caseItem.status, feeAmount, feePaid + nextAmount);
      if (thresholdError) {
        return res.status(400).send(thresholdError);
      }
      const nextReceiptNo = String(receiptNo || "").trim() || (await generateReceiptNumber());
      const created = await prisma.receipt.create({
        data: {
          caseId: Number(caseId),
          amount: Number(amount),
          paymentMethod,
          collectedAt: collectedAt ? new Date(collectedAt) : new Date(),
          collectedBy: req.user.username,
          note: note || null,
          receiptNo: nextReceiptNo,
        },
      });
      await syncCaseFeeSummary(Number(caseId), req.user?.username);
      await prisma.auditLog.create({
        data: {
          caseId: Number(caseId),
          action: "RECEIPT_CREATED",
          notes: `Phiếu thu ${created.receiptNo} - ${Number(created.amount).toLocaleString("vi-VN")} đ`,
          user: req.user.username,
        },
      });
      return res.status(201).json(created);
    } catch (error) {
      console.error(error);
      if (error?.code === "P2002") return res.status(409).send("Số phiếu thu đã tồn tại");
      return res.status(500).send("Lỗi tạo phiếu thu");
    }
  }
);

app.put(
  "/receipts/:id",
  authenticateToken,
  checkPermission("manage_receipts"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("amount").optional().isFloat({ min: 1 }),
    body("paymentMethod").optional().isIn(Object.values(PAYMENT_METHODS)),
    body("collectedAt").optional().isISO8601(),
    body("note").optional().isString().isLength({ max: 500 }),
    body("receiptNo").optional().isString().trim().isLength({ min: 3, max: 50 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { amount, paymentMethod, collectedAt, note, receiptNo } = req.body;
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id },
        include: { case: { select: { feeAmount: true, feePaid: true, status: true } } },
      });
      if (!receipt) return res.status(404).send("Receipt not found");
      const originalAmount = Number(receipt.amount || 0);
      const nextAmount = Number(amount !== undefined ? amount : originalAmount);
      const feeAmount = Number(receipt.case?.feeAmount || 0);
      const feePaid = Number(receipt.case?.feePaid || 0);
      const projectedTotalPaid = feePaid - originalAmount + nextAmount;
      if (feeAmount > 0 && projectedTotalPaid > feeAmount) {
        return res.status(400).send("Số tiền phiếu thu vượt quá Tổng chi phí của hồ sơ.");
      }
      const thresholdError = validateFeeThresholdForStatus(receipt.case?.status, feeAmount, projectedTotalPaid);
      if (thresholdError) {
        return res.status(400).send(thresholdError);
      }
      const updated = await prisma.receipt.update({
        where: { id },
        data: {
          ...(amount !== undefined && { amount: Number(amount) }),
          ...(paymentMethod !== undefined && { paymentMethod }),
          ...(collectedAt !== undefined && { collectedAt: new Date(collectedAt) }),
          ...(note !== undefined && { note: note || null }),
          ...(receiptNo !== undefined && { receiptNo: String(receiptNo || "").trim() || receipt.receiptNo }),
        },
      });
      await syncCaseFeeSummary(receipt.caseId, req.user?.username);
      await prisma.auditLog.create({
        data: {
          caseId: receipt.caseId,
          action: "RECEIPT_UPDATED",
          notes: `Cập nhật phiếu thu ${updated.receiptNo}`,
          user: req.user.username,
        },
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      if (error?.code === "P2002") return res.status(409).send("Số phiếu thu đã tồn tại");
      return res.status(500).send("Lỗi cập nhật phiếu thu");
    }
  }
);

app.delete(
  "/receipts/:id",
  authenticateToken,
  checkPermission("manage_receipts"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id },
        include: { case: { select: { feeAmount: true, feePaid: true, status: true } } },
      });
      if (!receipt) return res.status(404).send("Receipt not found");
      const feeAmount = Number(receipt.case?.feeAmount || 0);
      const feePaid = Number(receipt.case?.feePaid || 0);
      const projectedTotalPaid = feePaid - Number(receipt.amount || 0);
      const thresholdError = validateFeeThresholdForStatus(receipt.case?.status, feeAmount, projectedTotalPaid);
      if (thresholdError) {
        return res.status(400).send(thresholdError);
      }
      await prisma.receipt.delete({ where: { id } });
      await syncCaseFeeSummary(receipt.caseId, req.user?.username);
      await prisma.auditLog.create({
        data: {
          caseId: receipt.caseId,
          action: "RECEIPT_DELETED",
          notes: `Xóa phiếu thu ${receipt.receiptNo}`,
          user: req.user.username,
        },
      });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa phiếu thu");
    }
  }
);

app.get(
  "/receipts/export",
  authenticateToken,
  checkPermission("manage_receipts"),
  validateRequest([query("lang").optional().isIn(["vi", "en"])]),
  async (req, res) => {
    try {
      const lang = String(req.query.lang || "vi").toLowerCase() === "en" ? "en" : "vi";
      const receipts = await prisma.receipt.findMany({
        include: { case: { select: { caseId: true, customerName: true, feeAmount: true, feePaid: true } } },
        orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
      });
      const rows = [
        lang === "en"
          ? [
              "ReceiptNo",
              "CaseId",
              "Customer",
              "CaseTotalCost",
              "CaseCollected",
              "CaseOutstanding",
              "Amount",
              "PaymentMethod",
              "CollectedBy",
              "CollectedAt",
              "Note",
            ]
          : [
              "Số phiếu thu",
              "Mã hồ sơ",
              "Khách hàng",
              "Tổng chi phí",
              "Đã thu",
              "Còn thiếu",
              "Số tiền",
              "Phương thức thu",
              "Người thu",
              "Ngày thu",
              "Ghi chú",
            ],
        ...receipts.map((item) => [
          item.receiptNo,
          item.case?.caseId || "",
          item.case?.customerName || "",
          Number(item.case?.feeAmount || 0),
          Number(item.case?.feePaid || 0),
          Math.max(0, Number(item.case?.feeAmount || 0) - Number(item.case?.feePaid || 0)),
          Number(item.amount || 0),
          toPaymentMethodLabelByLang(item.paymentMethod || "", lang),
          item.collectedBy || "",
          item.collectedAt ? new Date(item.collectedAt).toISOString() : "",
          item.note || "",
        ]),
      ];
      const csv = toCsvString(rows);
      return res
        .setHeader("Content-Type", "text/csv; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="${
            lang === "en" ? `ReceiptReport_${getVietnamDateStamp()}.csv` : `BaoCaoPhieuThu_${getVietnamDateStamp()}.csv`
          }"`
        )
        .send(Buffer.from(`\uFEFF${csv}`, "utf8"));
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xuất báo cáo phiếu thu");
    }
  }
);

app.post(
  "/cases/:id/generate-document",
  authenticateToken,
  checkPermission("generate_document"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("templateId").isInt({ min: 1 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { templateId } = req.body;
    try {
      const [caseItem, template] = await Promise.all([
        prisma.case.findUnique({ where: { id }, include: { customer: true } }),
        prisma.documentTemplate.findUnique({ where: { id: Number(templateId) } }),
      ]);
      if (!caseItem) return res.status(404).send("Case not found");
      if (!template || !template.isActive || template.status !== TEMPLATE_STATUS.APPROVED) {
        return res.status(404).send("Template not found or inactive");
      }

      const renderPayload = {
        case: {
          id: caseItem.id,
          caseId: caseItem.caseId,
          customerId: caseItem.customerId ?? "",
          customerName: caseItem.customerName,
          customerGender: caseItem.customer?.gender || "",
          customerGenderLabel: toGenderLabelVi(caseItem.customer?.gender),
          customerDateOfBirth: toViDateOrEmpty(caseItem.customer?.dateOfBirth),
          phone: caseItem.phone,
          type: caseItem.type,
          caseCategory: caseItem.caseCategory || "",
          authorizationKind: caseItem.authorizationKind || "",
          certificationKind: caseItem.certificationKind || "",
          description: caseItem.description || "",
          notes: caseItem.notes || "",
          status: caseItem.status,
          assignedTo: caseItem.assignedTo || "",
          deadline: toIsoOrEmpty(caseItem.deadline),
          priority: caseItem.priority || "",
          notaryBookNumber: caseItem.notaryBookNumber || "",
          notaryRecordNumber: caseItem.notaryRecordNumber || "",
          issuedAt: toIsoOrEmpty(caseItem.issuedAt),
          isLocked: Boolean(caseItem.isLocked),
          feeAmount: caseItem.feeAmount ?? 0,
          feePaid: caseItem.feePaid ?? 0,
          feeReceiptNo: caseItem.feeReceiptNo || "",
          paymentMethod: caseItem.paymentMethod || PAYMENT_METHODS.CASH,
          draftedBy: caseItem.draftedBy || "",
          reviewedBy: caseItem.reviewedBy || "",
          signedAt: toIsoOrEmpty(caseItem.signedAt),
          sealedAt: toIsoOrEmpty(caseItem.sealedAt),
          releasedAt: toIsoOrEmpty(caseItem.releasedAt),
          releaseCode: caseItem.releaseCode || "",
          signatureStatus: caseItem.signatureStatus || "",
          signerName: caseItem.signerName || "",
          certificateSerial: caseItem.certificateSerial || "",
          signatureProvider: caseItem.signatureProvider || "",
          signatureCheckedAt: toIsoOrEmpty(caseItem.signatureCheckedAt),
          publicTrackingCode: caseItem.publicTrackingCode || "",
          publicTrackingEnabled: Boolean(caseItem.publicTrackingEnabled),
          createdAt: toIsoOrEmpty(caseItem.createdAt),
          updatedAt: toIsoOrEmpty(caseItem.updatedAt),
        },
        customer: {
          id: caseItem.customer?.id ?? "",
          customerId: caseItem.customer?.customerId || "",
          fullName: caseItem.customer?.fullName || caseItem.customerName,
          phone: caseItem.customer?.phone || caseItem.phone,
          idNumber: caseItem.customer?.idNumber || "",
          address: caseItem.customer?.address || "",
          email: caseItem.customer?.email || "",
          gender: caseItem.customer?.gender || "",
          genderLabel: toGenderLabelVi(caseItem.customer?.gender),
          dateOfBirth: toViDateOrEmpty(caseItem.customer?.dateOfBirth),
          notes: caseItem.customer?.notes || "",
          createdAt: toIsoOrEmpty(caseItem.customer?.createdAt),
          updatedAt: toIsoOrEmpty(caseItem.customer?.updatedAt),
        },
        office: {
          generatedAt: new Date().toISOString(),
          generatedBy: req.user.username,
        },
      };
      const rendered = renderTemplateContent(template.content, renderPayload);
      const renderedText = htmlToPlainText(rendered);
      const safeCode = template.code.replace(/[^A-Z0-9_-]/gi, "_");
      let storedFilename = `${Date.now()}-${safeCode}-${caseItem.caseId}.txt`;
      let fileType = "GENERATED_DOC";
      if (template.useSourceDocx && template.sourceDocxPath) {
        const sourceDocxAbsolutePath = path.join(__dirname, "uploads", path.basename(template.sourceDocxPath));
        if (fs.existsSync(sourceDocxAbsolutePath)) {
          const sourceBinary = fs.readFileSync(sourceDocxAbsolutePath, "binary");
          const sourceZip = new PizZip(sourceBinary);
          const hasSourcePlaceholders = hasMustachePlaceholdersInZip(sourceZip);
          const hasTemplateAnchor = hasTemplateContentAnchorInZip(sourceZip);
          let renderedBuffer = null;
          if (!hasSourcePlaceholders && !hasTemplateAnchor) {
            return res.status(422).json({
              message:
                "File Word mẫu gốc chưa có placeholder {{...}} hoặc {{template.content}}. Không thể sinh văn bản có dữ liệu mà vẫn giữ định dạng gốc.",
              code: "SOURCE_DOCX_NO_PLACEHOLDER",
            });
          }

          if (hasSourcePlaceholders) {
            try {
              renderedBuffer = renderSourceDocxWithDocxtemplater(sourceBinary, {
                ...renderPayload,
                template: {
                  content: renderedText,
                  contentText: renderedText,
                },
              });
            } catch (docxtemplaterError) {
              console.warn(
                `Source DOCX docxtemplater fallback for template ${template.id}:`,
                docxtemplaterError?.message || docxtemplaterError
              );
            }
          }

          if (!renderedBuffer && hasTemplateAnchor) {
            try {
              replaceScalarPlaceholdersInZip(sourceZip, renderPayload);
              const replacedZip = replaceTemplateContentAnchorsInZip(sourceZip, renderedText).zip;
              renderedBuffer = replacedZip.generate({ type: "nodebuffer" });
            } catch (xmlFallbackError) {
              console.warn(
                `Source DOCX anchor replacement fallback failed for template ${template.id}:`,
                xmlFallbackError?.message || xmlFallbackError
              );
            }
          }

          if (!renderedBuffer) {
            return res.status(422).json({
              message:
                "Không thể merge dữ liệu vào file Word mẫu gốc hiện tại mà vẫn giữ định dạng. Vui lòng kiểm tra placeholder trong file gốc.",
              code: "SOURCE_DOCX_RENDER_FAILED",
            });
          }

          storedFilename = `${Date.now()}-${safeCode}-${caseItem.caseId}.docx`;
          const filePath = path.join(__dirname, "uploads", storedFilename);
          fs.writeFileSync(filePath, renderedBuffer);
          fileType = "GENERATED_DOCX";
        } else {
          const filePath = path.join(__dirname, "uploads", storedFilename);
          fs.writeFileSync(filePath, rendered, "utf8");
        }
      } else {
        const filePath = path.join(__dirname, "uploads", storedFilename);
        fs.writeFileSync(filePath, rendered, "utf8");
      }
      const fileUrl = `${publicApiOrigin(req)}/uploads/${storedFilename}`;
      const generatedFile = await prisma.file.create({
        data: {
          caseId: caseItem.id,
          filename: `${safeCode}-${caseItem.caseId}.${fileType === "GENERATED_DOCX" ? "docx" : "txt"}`,
          url: fileUrl,
          fileType,
          uploadedBy: req.user.username,
        },
      });
      await prisma.auditLog.create({
        data: {
          caseId: caseItem.id,
          action: "DOCUMENT_GENERATED",
          notes: `${template.code} v${template.version}`,
          user: req.user.username,
          details: `fileId=${generatedFile.id}`,
        },
      });
      return res.json({
        message: "Sinh văn bản thành công",
        file: generatedFile,
        preview: rendered.slice(0, 1000),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi sinh văn bản");
    }
  }
);

app.post(
  "/cases/:id/sign",
  authenticateToken,
  checkPermission("sign_release"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (caseItem.isLocked) return res.status(423).send("Case is locked");
      const updated = await prisma.case.update({
        where: { id },
        data: {
          draftedBy: caseItem.draftedBy || req.user.username,
          reviewedBy: req.user.username,
          signedAt: new Date(),
          history: {
            create: {
              action: "SIGNED",
              notes: `Signed by ${req.user.username}`,
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi ký duyệt");
    }
  }
);

app.post(
  "/cases/:id/seal",
  authenticateToken,
  checkPermission("sign_release"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!caseItem.signedAt) return res.status(400).send("Can ky duyet truoc khi dong dau");
      if (caseItem.isLocked) return res.status(423).send("Case is locked");
      const updated = await prisma.case.update({
        where: { id },
        data: {
          sealedAt: new Date(),
          history: {
            create: {
              action: "SEALED",
              notes: `Sealed by ${req.user.username}`,
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi đóng dấu");
    }
  }
);

app.post(
  "/cases/:id/release",
  authenticateToken,
  checkPermission("sign_release"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("templateId").optional().isInt({ min: 1 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { templateId } = req.body;
    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: { customer: true, files: true },
      });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!caseItem.signedAt || !caseItem.sealedAt) {
        return res.status(400).send("Cần ký và đóng dấu trước khi phát hành");
      }
      if (caseItem.signatureStatus !== "VERIFIED_BASIC" || !caseItem.signedFileId) {
        return res.status(400).send("Cần có bản PDF đã ký số hợp lệ trước khi phát hành");
      }
      if (!caseItem.notaryRecordNumber) {
        return res.status(400).send("Cần phát hành số công chứng trước");
      }
      let sourceText = "";
      if (templateId) {
        const template = await prisma.documentTemplate.findUnique({ where: { id: Number(templateId) } });
        if (!template) return res.status(404).send("Template not found");
        sourceText = renderTemplateContent(template.content, {
          case: caseItem,
          customer: caseItem.customer || {},
          office: { generatedAt: new Date().toISOString(), generatedBy: req.user.username },
        });
      } else {
        const latestGenerated = caseItem.files
          .filter((item) => item.fileType === "GENERATED_DOC")
          .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
        if (!latestGenerated) return res.status(400).send("Cần sinh văn bản trước khi phát hành");
        const sourcePath = path.join(__dirname, "uploads", path.basename(latestGenerated.url));
        sourceText = fs.existsSync(sourcePath)
          ? fs.readFileSync(sourcePath, "utf8")
          : `Case ${caseItem.caseId}`;
      }

      const releaseCode = caseItem.releaseCode || `PH-${getVietnamDateStamp()}-${caseItem.id}`;
      const pdfStoredFilename = `${Date.now()}-${releaseCode}.pdf`;
      const pdfPath = path.join(__dirname, "uploads", pdfStoredFilename);
      await renderSimplePdfToFile(pdfPath, "VAN BAN CONG CHUNG - BAN PHAT HANH", [
        `Release code: ${releaseCode}`,
        `Case: ${caseItem.caseId}`,
        `Notary: ${caseItem.notaryBookNumber || ""}/${caseItem.notaryRecordNumber || ""}`,
        `Signed at: ${caseItem.signedAt ? new Date(caseItem.signedAt).toISOString() : ""}`,
        `Sealed at: ${caseItem.sealedAt ? new Date(caseItem.sealedAt).toISOString() : ""}`,
        "-----------------------------",
        sourceText,
      ]);
      const fileUrl = `${publicApiOrigin(req)}/uploads/${pdfStoredFilename}`;
      const releasedFile = await prisma.file.create({
        data: {
          caseId: caseItem.id,
          filename: `BanPhatHanh-${caseItem.caseId}.pdf`,
          url: fileUrl,
          fileType: "RELEASED_PDF",
          uploadedBy: req.user.username,
        },
      });
      const updatedCase = await prisma.case.update({
        where: { id: caseItem.id },
        data: {
          releasedAt: new Date(),
          releaseCode,
          isLocked: false,
          history: {
            create: {
              action: "RELEASED",
              notes: `Released ${releaseCode}`,
              user: req.user.username,
              details: `fileId=${releasedFile.id}`,
            },
          },
        },
        include: { files: true, history: true },
      });
      return res.json({ case: updatedCase, file: releasedFile, releaseCode });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi phát hành văn bản");
    }
  }
);

app.post(
  "/cases/:id/upload-signed-pdf",
  authenticateToken,
  checkPermission("sign_release"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("signerName").optional().isString().trim().isLength({ min: 2, max: 120 }),
    body("certificateSerial").optional().isString().trim().isLength({ max: 120 }),
    body("signatureProvider").optional().isString().trim().isLength({ max: 120 }),
  ]),
  upload.single("file"),
  async (req, res) => {
    const id = Number(req.params.id);
    const { signerName, certificateSerial, signatureProvider } = req.body;
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!req.file) return res.status(400).send("Không tìm thấy tệp đã ký");
      if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
        return res.status(400).send("Chỉ chấp nhận tài liệu PDF đã ký");
      }
      const storedUrl = `${publicApiOrigin(req)}/uploads/${req.file.filename}`;
      const createdFile = await prisma.file.create({
        data: {
          caseId: caseItem.id,
          filename: req.file.originalname,
          url: storedUrl,
          fileType: "SIGNED_PDF",
          uploadedBy: req.user.username,
        },
      });
      const filePath = path.join(__dirname, "uploads", req.file.filename);
      const verifyResult = verifySignedPdfBasic(filePath);
      const nextStatus = verifyResult.valid ? "VERIFIED_BASIC" : "INVALID_BASIC";
      const updated = await prisma.case.update({
        where: { id: caseItem.id },
        data: {
          signedFileId: createdFile.id,
          signatureStatus: nextStatus,
          signerName: signerName || caseItem.signerName,
          certificateSerial: certificateSerial || caseItem.certificateSerial,
          signatureProvider: signatureProvider || caseItem.signatureProvider,
          signatureCheckedAt: new Date(),
          history: {
            create: {
              action: "SIGNED_PDF_UPLOADED",
              notes: `status=${nextStatus}`,
              user: req.user.username,
              details: JSON.stringify(verifyResult.checks),
            },
          },
        },
        include: { files: true, history: true },
      });
      return res.json({
        case: updated,
        verify: verifyResult,
        message: verifyResult.valid
          ? "Đã tải lên và xác minh chữ ký cơ bản"
          : "Tải lên thành công nhưng chữ ký chưa hợp lệ ở mức cơ bản",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải lên tệp đã ký");
    }
  }
);

app.get(
  "/cases/:id/sign-verify",
  authenticateToken,
  checkPermission("view_all"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: { files: { orderBy: { uploadedAt: "desc" } } },
      });
      if (!caseItem) return res.status(404).send("Case not found");
      const signedFile = caseItem.files.find((f) => f.id === caseItem.signedFileId);
      return res.json({
        signatureStatus: caseItem.signatureStatus,
        signerName: caseItem.signerName,
        certificateSerial: caseItem.certificateSerial,
        signatureProvider: caseItem.signatureProvider,
        signatureCheckedAt: caseItem.signatureCheckedAt,
        signedFile: signedFile || null,
        canRelease: caseItem.signatureStatus === "VERIFIED_BASIC" && Boolean(caseItem.signedFileId),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi kiểm tra chữ ký");
    }
  }
);

app.post(
  "/cases/:id/public-tracking-link",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!ensureCaseAssignmentAccess(req, res, caseItem)) return;
      const sourceIdNumber = caseItem.customer?.idNumber || "";
      if (!extractLast4Digits(sourceIdNumber)) {
        return res
          .status(400)
          .send("Khách hàng chưa có CCCD hợp lệ để thiết lập OTP 4 số cuối");
      }
      const nextCode = caseItem.publicTrackingCode || (await generateUniquePublicTrackingCode());
      const updatedCase = await prisma.case.update({
        where: { id: caseItem.id },
        data: {
          publicTrackingCode: nextCode,
          publicTrackingEnabled: true,
          history: {
            create: {
              action: "PUBLIC_TRACKING_ENABLED",
              notes: `code=${nextCode}`,
              user: req.user.username,
            },
          },
        },
      });
      return res.json({
        caseId: updatedCase.caseId,
        publicTrackingCode: nextCode,
        trackingPath: `/track/${nextCode}`,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tạo liên kết tra cứu công khai");
    }
  }
);

app.post(
  "/public/track/:code",
  publicTrackLimiter,
  validateRequest([
    param("code").isString().trim().isLength({ min: 8, max: 64 }),
    body("otp").isString().matches(/^\d{4}$/),
  ]),
  async (req, res) => {
    const code = String(req.params.code).trim().toUpperCase();
    const otp = String(req.body.otp).trim();
    try {
      const caseItem = await prisma.case.findFirst({
        where: {
          publicTrackingCode: code,
          publicTrackingEnabled: true,
        },
        include: {
          customer: true,
          history: {
            orderBy: { timestamp: "desc" },
            take: 20,
          },
        },
      });
      if (!caseItem) return res.status(404).send("Không tìm thấy liên kết tra cứu");
      const expectedOtp = extractLast4Digits(caseItem.customer?.idNumber || "");
      if (!expectedOtp) return res.status(400).send("Hồ sơ chưa đủ điều kiện tra cứu OTP");
      if (otp !== expectedOtp) return res.status(401).send("OTP không đúng");
      return res.json({
        case: {
          caseId: caseItem.caseId,
          customerNameMasked: maskName(caseItem.customerName),
          phoneMasked: caseItem.phone ? `******${extractLast4Digits(caseItem.phone)}` : "",
          type: caseItem.type,
          status: caseItem.status,
          deadline: caseItem.deadline,
          updatedAt: caseItem.updatedAt,
          assignedTo: caseItem.assignedTo ? maskName(caseItem.assignedTo) : "",
        },
        timeline: caseItem.history.map((item) => ({
          action: item.action,
          fromStatus: item.fromStatus,
          toStatus: item.toStatus,
          timestamp: item.timestamp,
        })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tra cứu công khai");
    }
  }
);

app.put(
  "/cases/:id/status",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("status").isString().isLength({ min: 3, max: 50 }),
    body("notes").optional().isString().isLength({ max: 2000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { status, notes } = req.body;

    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: {
          files: true,
          customer: true,
          history: {
            orderBy: { timestamp: "asc" },
            take: 1,
          },
        },
      });
      if (!caseItem) {
        return res.status(404).send("Case not found");
      }
      if (!ensureCaseNotLocked(caseItem, res)) return;
      if (!ensureCaseAssignmentAccess(req, res, caseItem, { allowAccountant: true })) return;

      const validTransitions = {
        [WORKFLOW_STATUS.RECEIVED]: [WORKFLOW_STATUS.RECEIPT],
        [WORKFLOW_STATUS.RECEIPT]: [WORKFLOW_STATUS.LEGAL_CHECKING],
        [WORKFLOW_STATUS.LEGAL_CHECKING]: [
          WORKFLOW_STATUS.DRAFTING,
          WORKFLOW_STATUS.RECEIVED,
        ],
        [WORKFLOW_STATUS.DRAFTING]: [WORKFLOW_STATUS.REVIEWING],
        [WORKFLOW_STATUS.REVIEWING]: [
          WORKFLOW_STATUS.APPROVED,
          WORKFLOW_STATUS.DRAFTING,
        ],
        [WORKFLOW_STATUS.APPROVED]: [WORKFLOW_STATUS.NOTARIZED],
        [WORKFLOW_STATUS.NOTARIZED]: [WORKFLOW_STATUS.DEBT],
        [WORKFLOW_STATUS.DEBT]: [WORKFLOW_STATUS.ARCHIVED],
        [WORKFLOW_STATUS.CANCELLED]: [],
      };

      if (caseItem.status === WORKFLOW_STATUS.RECEIPT && status === WORKFLOW_STATUS.LEGAL_CHECKING) {
        if (!caseItem.feeAmount || Number(caseItem.feeAmount) <= 0) {
          return res.status(400).send("Cần cập nhật Tổng chi phí trước khi chuyển sang Kiểm tra pháp lý.");
        }
        if (Number(caseItem.feePaid || 0) < Number(caseItem.feeAmount || 0) * 0.3) {
          return res.status(400).send("Cần thu trước tối thiểu 30% tổng chi phí trước khi chuyển sang Kiểm tra pháp lý.");
        }
      }
      if (caseItem.status === WORKFLOW_STATUS.DEBT && status === WORKFLOW_STATUS.ARCHIVED) {
        if (Number(caseItem.feePaid || 0) < Number(caseItem.feeAmount || 0)) {
          return res.status(400).send("Chưa thu đủ 100% tổng chi phí, không thể lưu trữ hồ sơ.");
        }
      }

      if (!validTransitions[caseItem.status]?.includes(status)) {
        const fromLabel = WORKFLOW_STATUS_LABELS_VI[caseItem.status] || caseItem.status;
        const toLabel = WORKFLOW_STATUS_LABELS_VI[status] || status;
        return res
          .status(400)
          .send(`Không thể chuyển từ ${fromLabel} sang ${toLabel}.`);
      }

      if (status === WORKFLOW_STATUS.APPROVED || status === WORKFLOW_STATUS.NOTARIZED) {
        const missing = getMissingRequiredFileTypes(caseItem);
        if (missing.length > 0) {
          return res.status(400).json({
            message: "Hồ sơ chưa đủ tài liệu bắt buộc",
            missingFileTypes: missing,
          });
        }
      }

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          status,
          isLocked: status === WORKFLOW_STATUS.ARCHIVED ? true : caseItem.isLocked,
          publicTrackingCode:
            shouldEnablePublicTrackingByStatus(status)
              ? caseItem.publicTrackingCode || (await generateUniquePublicTrackingCode())
              : caseItem.publicTrackingCode,
          publicTrackingEnabled:
            shouldEnablePublicTrackingByStatus(status) ? true : caseItem.publicTrackingEnabled,
          updatedAt: new Date(),
          history: {
            create: {
              action: "STATUS_CHANGED",
              fromStatus: caseItem.status,
              toStatus: status,
              notes: notes || "",
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });

      await notifyCaseStatusTransition({ caseItem, updatedCase, actorUsername: req.user?.username });

      res.json(updatedCase);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi cập nhật trạng thái");
    }
  }
);

app.delete(
  "/cases/:id",
  authenticateToken,
  checkPermission("delete_case"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("reason").optional().isString().isLength({ max: 1000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const reason = String(req.body.reason || "").trim();
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (caseItem.isDeleted) return res.status(400).send("Case already deleted");
      if (caseItem.releasedAt || caseItem.notaryRecordNumber || caseItem.signatureStatus === "VERIFIED_BASIC") {
        return res.status(400).send("Không thể xóa hồ sơ đã phát hành/đã ký số");
      }
      const updated = await prisma.case.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user.username,
          deleteReason: reason || "Administrative deletion",
          status: WORKFLOW_STATUS.CANCELLED,
          history: {
            create: {
              action: "CASE_DELETED_SOFT",
              fromStatus: caseItem.status,
              toStatus: WORKFLOW_STATUS.CANCELLED,
              notes: reason || "Administrative deletion",
              user: req.user.username,
            },
          },
        },
      });
      return res.json({ message: "Xóa mềm hồ sơ thành công", id: updated.id });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa hồ sơ");
    }
  }
);

app.post(
  "/cases/:id/restore",
  authenticateToken,
  checkPermission("delete_case"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!caseItem.isDeleted) return res.status(400).send("Case is not deleted");

      const updated = await prisma.case.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
          status: WORKFLOW_STATUS.RECEIVED,
          history: {
            create: {
              action: "CASE_RESTORED",
              fromStatus: caseItem.status,
              toStatus: WORKFLOW_STATUS.RECEIVED,
              notes: "Administrative restore",
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi khôi phục hồ sơ");
    }
  }
);

app.post(
  "/cases/:id/financial-reset",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("reason").isString().trim().isLength({ min: 5, max: 1000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const reason = String(req.body.reason || "").trim();
    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: { customer: true, history: { orderBy: { timestamp: "asc" }, take: 1 } },
      });
      if (!caseItem) return res.status(404).send("Case not found");
      if (caseItem.isDeleted) return res.status(400).send("Không thể khởi tạo lại hồ sơ đã hủy.");
      if (caseItem.status === WORKFLOW_STATUS.CANCELLED) {
        return res.status(400).send("Không thể khởi tạo lại hồ sơ đã hủy.");
      }
      const receiptCount = await prisma.receipt.count({ where: { caseId: id } });
      const updatedCase = await prisma.$transaction(async (tx) => {
        await tx.receipt.deleteMany({ where: { caseId: id } });
        await tx.auditLog.create({
          data: {
            caseId: id,
            action: "CASE_FINANCIAL_RESET",
            notes: reason,
            user: req.user.username,
            details: JSON.stringify({
              preResetStatus: caseItem.status,
              deletedReceipts: receiptCount,
              resetReason: reason,
            }),
          },
        });
        return tx.case.update({
          where: { id },
          data: {
            status: WORKFLOW_STATUS.RECEIVED,
            feeAmount: 0,
            feePaid: 0,
            feeReceiptNo: null,
            paymentMethod: PAYMENT_METHODS.CASH,
            isLocked: false,
            history: {
              create: {
                action: "STATUS_CHANGED",
                fromStatus: caseItem.status,
                toStatus: WORKFLOW_STATUS.RECEIVED,
                notes: `Financial reset: ${reason}`,
                user: req.user.username,
              },
            },
          },
          include: { customer: true, history: true, files: true },
        });
      });
      await notifyCaseStatusTransition({ caseItem, updatedCase, actorUsername: req.user?.username });
      const accountants = await prisma.user.findMany({
        where: { role: USER_ROLES.ACCOUNTANT, isActive: true },
        select: { username: true },
      });
      await Promise.all(
        accountants.map((item) =>
          createNotificationForUsername({
            username: item.username,
            caseId: updatedCase.id,
            message: `Hồ sơ ${updatedCase.caseId} đã khởi tạo lại tài chính, cần thu phí lại từ đầu.`,
            type: "warning",
            actionUrl: `/cases/${updatedCase.id}`,
          })
        )
      );
      return res.json(updatedCase);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi khởi tạo lại hồ sơ tài chính");
    }
  }
);

app.put(
  "/cases/:id/assign",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("assignedTo").isString().trim().isLength({ min: 3, max: 64 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { assignedTo } = req.body;

    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) {
        return res.status(404).send("Case not found");
      }
      if (!ensureCaseNotLocked(caseItem, res)) return;
      if (!ensureCaseAssignmentAccess(req, res, caseItem, { allowCoordinator: true })) return;
      if (!canCoordinateCaseAssignment(req.user?.role)) {
        return res.status(403).send("Bạn không có quyền điều phối phân công hồ sơ.");
      }

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          assignedTo,
          updatedAt: new Date(),
          history: {
            create: {
              action: "ASSIGNED",
              notes: `Assigned to ${assignedTo}`,
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });

      await createNotificationForUsername({
        username: assignedTo,
        caseId: updatedCase.id,
        message: `${req.user.username} đã gán hồ sơ ${updatedCase.caseId} cho bạn`,
        type: "success",
        actionUrl: `/cases/${updatedCase.id}`,
      });

      res.json(updatedCase);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi gán hồ sơ");
    }
  }
);

app.put(
  "/cases/assign/batch",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([
    body("assignedTo").isString().trim().isLength({ min: 3, max: 64 }),
    body("caseIds").isArray({ min: 1 }),
    body("caseIds.*").isInt({ min: 1 }),
  ]),
  async (req, res) => {
    const { assignedTo, caseIds } = req.body;
    const normalizedCaseIds = Array.from(
      new Set((Array.isArray(caseIds) ? caseIds : []).map((item) => Number(item)).filter((item) => item > 0))
    );

    try {
      const cases = await prisma.case.findMany({
        where: { id: { in: normalizedCaseIds } },
        select: { id: true, caseId: true, assignedTo: true, isLocked: true, isDeleted: true },
      });
      if (!canCoordinateCaseAssignment(req.user?.role)) {
        return res.status(403).send("Bạn không có quyền điều phối phân công hồ sơ theo batch.");
      }
      const existingCaseIdSet = new Set(cases.map((item) => item.id));
      const missingCaseIds = normalizedCaseIds.filter((id) => !existingCaseIdSet.has(id));
      const updatableCases = cases.filter((item) => !item.isLocked && !item.isDeleted);
      const skippedLockedOrDeleted = cases
        .filter((item) => item.isLocked || item.isDeleted)
        .map((item) => item.id);

      const updatedCases = [];
      for (const caseItem of updatableCases) {
        const updated = await prisma.case.update({
          where: { id: caseItem.id },
          data: {
            assignedTo,
            updatedAt: new Date(),
            history: {
              create: {
                action: "ASSIGNED_BATCH",
                notes: `Assigned in batch to ${assignedTo}`,
                user: req.user.username,
              },
            },
          },
          include: { files: true, history: true },
        });
        updatedCases.push(updated);
      }

      await Promise.all(
        updatedCases.map((updatedCase) =>
          createNotificationForUsername({
            username: assignedTo,
            caseId: updatedCase.id,
            message: `${req.user.username} đã gán hồ sơ ${updatedCase.caseId} cho bạn`,
            type: "success",
            actionUrl: `/cases/${updatedCase.id}`,
          })
        )
      );

      return res.json({
        assignedTo,
        requested: normalizedCaseIds.length,
        updatedCount: updatedCases.length,
        updatedCaseIds: updatedCases.map((item) => item.id),
        skipped: {
          missingCaseIds,
          lockedOrDeletedCaseIds: skippedLockedOrDeleted,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi phân công hồ sơ theo batch");
    }
  }
);

app.put(
  "/cases/:id/deadline",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("deadline").isISO8601(),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { deadline } = req.body;

    if (!deadline) {
      return res.status(400).send("Deadline required");
    }

    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) {
        return res.status(404).send("Case not found");
      }
      if (!ensureCaseNotLocked(caseItem, res)) return;
      if (!ensureCaseAssignmentAccess(req, res, caseItem)) return;

      const parsed = new Date(deadline);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).send("Deadline không hợp lệ");
      }

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          deadline: parsed,
          updatedAt: new Date(),
          history: {
            create: {
              action: "DEADLINE_SET",
              notes: `Deadline set to ${parsed.toISOString()}`,
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });

      res.json(updatedCase);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi cập nhật deadline");
    }
  }
);

app.post(
  "/upload/:id",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  upload.array("files", 20),
  async (req, res) => {
    const id = Number(req.params.id);
    const inputType = req.body.fileType || req.body.fileTypes || "OTHER";
    const fileTypes = Array.isArray(inputType) ? inputType : [inputType];

    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: {
          files: true,
          customer: true,
          history: {
            orderBy: { timestamp: "asc" },
            take: 1,
          },
        },
      });
      if (!caseItem) {
        return res.status(404).send("Case not found");
      }
      if (!ensureCaseNotLocked(caseItem, res)) return;
      if (!ensureCaseAssignmentAccess(req, res, caseItem)) return;

      if (!req.files || req.files.length === 0) {
        return res.status(400).send("Không có tệp nào được tải lên");
      }

      const createdFiles = [];
      const aiExtracted = [];

      for (let index = 0; index < req.files.length; index += 1) {
        const uploaded = req.files[index];
        const fileType = fileTypes[index] || fileTypes[0] || "OTHER";
        const fileUrl = `${publicApiOrigin(req)}/uploads/${uploaded.filename}`;
        const createdFile = await prisma.file.create({
          data: {
            caseId: id,
            filename: uploaded.originalname,
            url: fileUrl,
            fileType,
            uploadedBy: req.user.username,
          },
        });
        createdFiles.push(createdFile);

        await prisma.auditLog.create({
          data: {
            caseId: id,
            action: "FILE_UPLOADED",
            notes: uploaded.originalname,
            user: req.user.username,
          },
        });

        if (fileType === "CCCD") {
          aiExtracted.push({
            filename: uploaded.originalname,
            ...parseMockOcrFromFilename(uploaded.originalname),
          });
        }
      }

      if (caseItem.assignedTo) {
        await createNotificationForUsername({
          username: caseItem.assignedTo,
          caseId: caseItem.id,
          message: `Hồ sơ ${caseItem.caseId} vừa có tệp mới được tải lên`,
          type: "info",
          actionUrl: `/cases/${caseItem.id}`,
        });
      }

      const refreshedCase = await prisma.case.findUnique({
        where: { id },
        include: { files: true },
      });
      const missingFileTypes = getMissingRequiredFileTypes(refreshedCase);

      res.json({
        message: "Tải lên thành công",
        files: createdFiles,
        aiExtracted,
        riskWarnings:
          missingFileTypes.length > 0
            ? [
                {
                  type: "missing_documents",
                  message: `Hồ sơ còn thiếu: ${missingFileTypes.join(", ")}`,
                  missingFileTypes,
                },
              ]
            : [],
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi tải lên tệp");
    }
  }
);

app.get("/cases/:id/risk-warnings", authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const caseItem = await prisma.case.findUnique({
      where: { id },
      include: { files: true },
    });
    if (!caseItem) {
      return res.status(404).send("Case not found");
    }

    const missingFileTypes = getMissingRequiredFileTypes(caseItem);
    res.json({
      warnings:
        missingFileTypes.length > 0
          ? [
              {
                type: "missing_documents",
                message: `Hồ sơ còn thiếu: ${missingFileTypes.join(", ")}`,
                missingFileTypes,
              },
            ]
          : [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi lấy cảnh báo");
  }
});

app.post("/chat/presence", authenticateToken, async (req, res) => {
  try {
    const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!actor) return res.status(404).send("User not found");
    await prisma.chatPresence.upsert({
      where: { userId: actor.id },
      update: { lastSeenAt: new Date() },
      create: { userId: actor.id, lastSeenAt: new Date(), status: CHAT_STATUS.AVAILABLE },
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi cập nhật trạng thái online");
  }
});

app.patch(
  "/chat/presence/status",
  authenticateToken,
  validateRequest([body("status").isString().trim().isLength({ min: 3, max: 24 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const statusRaw = String(req.body.status || "").trim().toUpperCase();
      if (!CHAT_STATUS_VALUES.has(statusRaw)) return res.status(400).send("Trạng thái không hợp lệ");
      const updated = await prisma.chatPresence.upsert({
        where: { userId: actor.id },
        update: { status: statusRaw, lastSeenAt: new Date() },
        create: { userId: actor.id, status: statusRaw, lastSeenAt: new Date() },
      });
      io.emit("chat:presence", {
        userId: actor.id,
        username: actor.username,
        online: statusRaw !== CHAT_STATUS.INVISIBLE,
        status: updated.status,
      });
      return res.json({ ok: true, status: updated.status });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật trạng thái");
    }
  }
);

/** Minimal identity for chat/WebRTC (numeric user id). */
app.get("/chat/session", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.user.username },
      select: { id: true, username: true },
    });
    if (!user) return res.status(404).send("User not found");
    return res.json({ id: user.id, username: user.username });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi phiên chat");
  }
});

app.get("/chat/users", authenticateToken, async (req, res) => {
  try {
    const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!actor) return res.status(404).send("User not found");
    const now = Date.now();
    const ONLINE_WINDOW_MS = 60 * 1000;
    const presences = await prisma.chatPresence.findMany({
      select: { userId: true, lastSeenAt: true, status: true },
    });
    const presenceByUserId = new Map();
    for (const item of presences) {
      const status = CHAT_STATUS_VALUES.has(String(item.status || "")) ? String(item.status) : CHAT_STATUS.AVAILABLE;
      const online = now - new Date(item.lastSeenAt).getTime() <= ONLINE_WINDOW_MS && status !== CHAT_STATUS.INVISIBLE;
      presenceByUserId.set(Number(item.userId), { status, online });
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        username: { not: actor.username },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        avatarUrl: true,
      },
      orderBy: [{ fullName: "asc" }, { username: "asc" }],
    });
    const unreadRows = await prisma.directMessage.groupBy({
      by: ["senderId"],
      where: {
        receiverId: actor.id,
        readAt: null,
        receiverHidden: false,
      },
      _count: { _all: true },
    });
    const unreadBySenderId = unreadRows.reduce((acc, row) => {
      acc[row.senderId] = row._count?._all || 0;
      return acc;
    }, {});

    return res.json(
      users.map((item) => ({
        id: item.id,
        username: item.username,
        fullName: String(item.fullName || item.username || "").trim(),
        role: item.role,
        avatarUrl: item.avatarUrl || null,
        online: Boolean(presenceByUserId.get(Number(item.id))?.online),
        status: String(presenceByUserId.get(Number(item.id))?.status || CHAT_STATUS.AVAILABLE),
        unreadCount: unreadBySenderId[item.id] || 0,
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi tải danh sách người dùng chat");
  }
});

app.get("/chat/conversations", authenticateToken, async (req, res) => {
  try {
    const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!actor) return res.status(404).send("User not found");

    const now = Date.now();
    const ONLINE_WINDOW_MS = 60 * 1000;
    const presences = await prisma.chatPresence.findMany({
      select: { userId: true, lastSeenAt: true, status: true },
    });
    const presenceByUserId = new Map();
    for (const item of presences) {
      const status = CHAT_STATUS_VALUES.has(String(item.status || "")) ? String(item.status) : CHAT_STATUS.AVAILABLE;
      const online = now - new Date(item.lastSeenAt).getTime() <= ONLINE_WINDOW_MS && status !== CHAT_STATUS.INVISIBLE;
      presenceByUserId.set(Number(item.userId), { status, online });
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        username: { not: actor.username },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        avatarUrl: true,
      },
    });
    const userById = users.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    const unreadRows = await prisma.directMessage.groupBy({
      by: ["senderId"],
      where: {
        receiverId: actor.id,
        readAt: null,
      },
      _count: { _all: true },
    });
    const unreadBySenderId = unreadRows.reduce((acc, row) => {
      acc[row.senderId] = row._count?._all || 0;
      return acc;
    }, {});

    const latestMessages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: actor.id, senderHidden: false },
          { receiverId: actor.id, receiverHidden: false },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const conversationByPeerId = new Map();
    for (const message of latestMessages) {
      const peerId = message.senderId === actor.id ? message.receiverId : message.senderId;
      if (!userById[peerId]) continue;
      if (conversationByPeerId.has(peerId)) continue;
      conversationByPeerId.set(peerId, message);
    }

    const rows = users
      .filter((item) => conversationByPeerId.has(item.id))
      .map((item) => {
        const lastMessage = conversationByPeerId.get(item.id) || null;
        return {
          id: item.id,
          username: item.username,
          fullName: String(item.fullName || item.username || "").trim(),
          role: item.role,
          avatarUrl: item.avatarUrl || null,
          online: Boolean(presenceByUserId.get(Number(item.id))?.online),
          status: String(presenceByUserId.get(Number(item.id))?.status || CHAT_STATUS.AVAILABLE),
          unreadCount: unreadBySenderId[item.id] || 0,
          lastMessageText: lastMessage?.isDeleted
            ? "[Đã thu hồi tin nhắn]"
            : lastMessage?.attachmentName
              ? `[Tệp đính kèm] ${lastMessage.attachmentName}`
              : (lastMessage?.content || ""),
          lastMessageAt: lastMessage?.createdAt || null,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        const aUnread = Number(a.unreadCount || 0);
        const bUnread = Number(b.unreadCount || 0);
        if (aUnread !== bUnread) return bUnread - aUnread;
        return String(a.fullName || a.username).localeCompare(String(b.fullName || b.username), "vi", {
          sensitivity: "base",
        });
      });

    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi tải hội thoại");
  }
});

app.get(
  "/chat/search/direct",
  authenticateToken,
  validateRequest([
    query("q").isString().trim().isLength({ min: 1, max: 120 }),
    query("limit").optional().isInt({ min: 1, max: 200 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const q = String(req.query.q || "").trim();
      const limit = Number(req.query.limit || 60);
      const rows = await prisma.directMessage.findMany({
        where: {
          isDeleted: false,
          content: { contains: q },
          OR: [
            { senderId: actor.id, senderHidden: false },
            { receiverId: actor.id, receiverHidden: false },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
      });
      const peerIds = new Set();
      for (const item of rows) {
        const peerId = item.senderId === actor.id ? item.receiverId : item.senderId;
        peerIds.add(peerId);
      }
      const peers = await prisma.user.findMany({
        where: { id: { in: [...peerIds] }, isActive: true },
        select: { id: true, username: true, fullName: true },
      });
      const peerById = new Map(peers.map((item) => [Number(item.id), item]));
      const matched = new Map();
      for (const item of rows) {
        const peerId = item.senderId === actor.id ? item.receiverId : item.senderId;
        if (matched.has(peerId)) continue;
        const peer = peerById.get(Number(peerId));
        if (!peer?.username) continue;
        matched.set(peerId, {
          username: peer.username,
          fullName: String(peer.fullName || peer.username || "").trim(),
          snippet: String(item.content || "").slice(0, 180),
          createdAt: item.createdAt,
        });
        if (matched.size >= limit) break;
      }
      return res.json([...matched.values()]);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tìm kiếm hội thoại");
    }
  }
);

function toReactionMap(rows = []) {
  const output = {};
  for (const row of rows || []) {
    const emoji = String(row?.emoji || "").trim();
    const username = String(row?.user?.username || "").trim();
    if (!emoji || !username) continue;
    if (!output[emoji]) output[emoji] = [];
    output[emoji].push(username);
  }
  for (const key of Object.keys(output)) {
    output[key] = [...new Set(output[key])];
  }
  return output;
}

app.get(
  "/chat/direct/:username",
  authenticateToken,
  validateRequest([
    param("username").isString().trim().isLength({ min: 3, max: 120 }),
    query("limit").optional().isInt({ min: 1, max: 200 }),
    query("beforeId").optional().isInt({ min: 1 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const peerUsername = String(req.params.username || "").trim();
      const peer = await prisma.user.findUnique({ where: { username: peerUsername } });
      if (!peer || peer.isActive === false) return res.status(404).send("Peer user not found");

      const limit = Number(req.query.limit || 100);
      const beforeId = req.query.beforeId ? Number(req.query.beforeId) : 0;
      const deliveredResult = await prisma.directMessage.updateMany({
        where: {
          senderId: peer.id,
          receiverId: actor.id,
          deliveredAt: null,
        },
        data: { deliveredAt: new Date() },
      });
      if (Number(deliveredResult.count || 0) > 0) {
        emitToUser(peer.id, "chat:delivered", {
          byUsername: actor.username,
        });
      }
      const messages = await prisma.directMessage.findMany({
        where: {
          ...(beforeId > 0 ? { id: { lt: beforeId } } : {}),
          OR: [
            { senderId: actor.id, receiverId: peer.id, senderHidden: false },
            { senderId: peer.id, receiverId: actor.id, receiverHidden: false },
          ],
        },
        orderBy: { id: "desc" },
        take: limit,
        include: {
          reactions: {
            include: { user: { select: { username: true } } },
          },
        },
      });

      return res.json(
        messages.reverse().map((item) => ({
          id: item.id,
          content: item.isDeleted ? "" : item.content,
          createdAt: item.createdAt,
          deliveredAt: item.deliveredAt || null,
          readAt: item.readAt || null,
          editedAt: item.editedAt || null,
          isDeleted: Boolean(item.isDeleted),
          attachmentUrl: item.attachmentUrl || null,
          attachmentName: item.attachmentName || null,
          attachmentMime: item.attachmentMime || null,
          attachmentSize: item.attachmentSize || null,
          replyToMessageId: item.replyToMessageId || null,
          replyToSender: item.replyToSender || null,
          replyToSnippet: item.replyToSnippet || null,
          reactions: toReactionMap(item.reactions),
          senderUsername: item.senderId === actor.id ? actor.username : peer.username,
          receiverUsername: item.receiverId === actor.id ? actor.username : peer.username,
          isMine: item.senderId === actor.id,
        }))
      );
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải hội thoại");
    }
  }
);

app.delete(
  "/chat/direct/messages/:id",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const id = Number(req.params.id);
      const message = await prisma.directMessage.findUnique({ where: { id } });
      if (!message) return res.status(404).send("Message not found");
      if (message.senderId !== actor.id) return res.status(403).send("Không thể xóa tin nhắn của người khác");
      const peerId = Number(message.receiverId);
      const updated = await prisma.directMessage.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          content: "",
        },
      });
      const payload = {
        id: updated.id,
        content: "",
        createdAt: updated.createdAt,
        deliveredAt: updated.deliveredAt || null,
        readAt: updated.readAt || null,
        editedAt: updated.editedAt || null,
        isDeleted: true,
        attachmentUrl: updated.attachmentUrl || null,
        attachmentName: updated.attachmentName || null,
        attachmentMime: updated.attachmentMime || null,
        attachmentSize: updated.attachmentSize || null,
        replyToMessageId: updated.replyToMessageId || null,
        replyToSender: updated.replyToSender || null,
        replyToSnippet: updated.replyToSnippet || null,
        reactions: {},
      };
      emitToUser(actor.id, "chat:message-updated", payload);
      emitToUser(peerId, "chat:message-updated", payload);
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa tin nhắn");
    }
  }
);

app.post(
  "/chat/direct/:username",
  authenticateToken,
  validateRequest([
    param("username").isString().trim().isLength({ min: 3, max: 120 }),
    body("content").isString().trim().isLength({ min: 1, max: 2000 }),
    body("replyToId").optional().isInt({ min: 1 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");

      const peerUsername = String(req.params.username || "").trim();
      const peer = await prisma.user.findUnique({ where: { username: peerUsername } });
      if (!peer || peer.isActive === false) return res.status(404).send("Peer user not found");

      const content = String(req.body.content || "").trim();
      const replyToId = req.body.replyToId ? Number(req.body.replyToId) : null;
      let replyToMeta = {};
      if (replyToId) {
        const quoted = await prisma.directMessage.findUnique({ where: { id: replyToId } });
        const canQuote =
          quoted &&
          ((quoted.senderId === actor.id && quoted.receiverId === peer.id) ||
            (quoted.senderId === peer.id && quoted.receiverId === actor.id));
        if (canQuote) {
          const snippetBase = quoted.isDeleted
            ? "Tin nhắn đã thu hồi"
            : quoted.attachmentName
              ? `[Tệp] ${quoted.attachmentName}`
              : (quoted.content || "");
          replyToMeta = {
            replyToMessageId: quoted.id,
            replyToSender: quoted.senderId === actor.id ? actor.username : peer.username,
            replyToSnippet: String(snippetBase).slice(0, 180),
          };
        }
      }
      const receiverOnline = isUserOnlineBySocket(peer.id);
      const created = await prisma.directMessage.create({
        data: {
          senderId: actor.id,
          receiverId: peer.id,
          content,
          deliveredAt: receiverOnline ? new Date() : null,
          ...replyToMeta,
        },
      });

      const responsePayload = {
        id: created.id,
        content: created.content,
        createdAt: created.createdAt,
        deliveredAt: created.deliveredAt || null,
        readAt: created.readAt || null,
        editedAt: created.editedAt || null,
        isDeleted: Boolean(created.isDeleted),
        attachmentUrl: created.attachmentUrl || null,
        attachmentName: created.attachmentName || null,
        attachmentMime: created.attachmentMime || null,
        attachmentSize: created.attachmentSize || null,
        replyToMessageId: created.replyToMessageId || null,
        replyToSender: created.replyToSender || null,
        replyToSnippet: created.replyToSnippet || null,
        reactions: {},
        senderUsername: actor.username,
        receiverUsername: peer.username,
        isMine: true,
      };
      emitToUser(actor.id, "chat:message", responsePayload);
      emitToUser(peer.id, "chat:message", { ...responsePayload, isMine: false });
      return res.status(201).json(responsePayload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi gửi tin nhắn chat");
    }
  }
);

app.post(
  "/chat/direct/:username/attachment",
  authenticateToken,
  chatUpload.single("file"),
  validateRequest([
    param("username").isString().trim().isLength({ min: 3, max: 120 }),
    body("replyToId").optional().isInt({ min: 1 }),
    body("content").optional().isString().isLength({ max: 2000 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const peerUsername = String(req.params.username || "").trim();
      const peer = await prisma.user.findUnique({ where: { username: peerUsername } });
      if (!peer || peer.isActive === false) return res.status(404).send("Peer user not found");
      if (!req.file) return res.status(400).send("Thiếu tệp đính kèm");
      const content = String(req.body.content || "").trim();
      const replyToId = req.body.replyToId ? Number(req.body.replyToId) : null;
      let replyToMeta = {};
      if (replyToId) {
        const quoted = await prisma.directMessage.findUnique({ where: { id: replyToId } });
        const canQuote =
          quoted &&
          ((quoted.senderId === actor.id && quoted.receiverId === peer.id) ||
            (quoted.senderId === peer.id && quoted.receiverId === actor.id));
        if (canQuote) {
          const snippetBase = quoted.isDeleted
            ? "Tin nhắn đã thu hồi"
            : quoted.attachmentName
              ? `[Tệp] ${quoted.attachmentName}`
              : (quoted.content || "");
          replyToMeta = {
            replyToMessageId: quoted.id,
            replyToSender: quoted.senderId === actor.id ? actor.username : peer.username,
            replyToSnippet: String(snippetBase).slice(0, 180),
          };
        }
      }

      const receiverOnline = isUserOnlineBySocket(peer.id);
      const created = await prisma.directMessage.create({
        data: {
          senderId: actor.id,
          receiverId: peer.id,
          content,
          attachmentUrl: req.file.filename,
          attachmentName: req.file.originalname,
          attachmentMime: req.file.mimetype || null,
          attachmentSize: Number(req.file.size || 0),
          deliveredAt: receiverOnline ? new Date() : null,
          ...replyToMeta,
        },
      });
      const payload = {
        id: created.id,
        content: created.content || "",
        createdAt: created.createdAt,
        deliveredAt: created.deliveredAt || null,
        readAt: created.readAt || null,
        editedAt: created.editedAt || null,
        isDeleted: Boolean(created.isDeleted),
        attachmentUrl: created.attachmentUrl || null,
        attachmentName: created.attachmentName || null,
        attachmentMime: created.attachmentMime || null,
        attachmentSize: created.attachmentSize || null,
        replyToMessageId: created.replyToMessageId || null,
        replyToSender: created.replyToSender || null,
        replyToSnippet: created.replyToSnippet || null,
        reactions: {},
        senderUsername: actor.username,
        receiverUsername: peer.username,
        isMine: true,
      };
      emitToUser(actor.id, "chat:message", payload);
      emitToUser(peer.id, "chat:message", { ...payload, isMine: false });
      return res.status(201).json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi gửi tệp đính kèm");
    }
  }
);

app.get(
  "/chat/direct/messages/:id/download",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const id = Number(req.params.id);
      const message = await prisma.directMessage.findUnique({ where: { id } });
      if (!message) return res.status(404).send("Message not found");
      const isParticipant = message.senderId === actor.id || message.receiverId === actor.id;
      if (!isParticipant) return res.status(403).send("Không có quyền tải tệp");
      if (!message.attachmentUrl) return res.status(404).send("Không có tệp đính kèm");
      const filePath = path.join(__dirname, "uploads", path.basename(message.attachmentUrl));
      if (!fs.existsSync(filePath)) return res.status(404).send("Tệp không tồn tại");
      return res.download(filePath, message.attachmentName || path.basename(message.attachmentUrl));
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải tệp đính kèm");
    }
  }
);

app.patch(
  "/chat/direct/messages/:id",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("content").isString().trim().isLength({ min: 1, max: 2000 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const id = Number(req.params.id);
      const message = await prisma.directMessage.findUnique({ where: { id } });
      if (!message) return res.status(404).send("Message not found");
      if (message.senderId !== actor.id) return res.status(403).send("Không thể sửa tin nhắn của người khác");
      if (message.isDeleted) return res.status(400).send("Tin nhắn đã thu hồi, không thể chỉnh sửa");
      const nextContent = String(req.body.content || "").trim();
      const updated = await prisma.directMessage.update({
        where: { id },
        data: {
          content: nextContent,
          editedAt: new Date(),
        },
      });
      const peerId = Number(updated.receiverId);
      const payload = {
        id: updated.id,
        content: updated.content,
        createdAt: updated.createdAt,
        deliveredAt: updated.deliveredAt || null,
        readAt: updated.readAt || null,
        editedAt: updated.editedAt || null,
        isDeleted: Boolean(updated.isDeleted),
        attachmentUrl: updated.attachmentUrl || null,
        attachmentName: updated.attachmentName || null,
        attachmentMime: updated.attachmentMime || null,
        attachmentSize: updated.attachmentSize || null,
        replyToMessageId: updated.replyToMessageId || null,
        replyToSender: updated.replyToSender || null,
        replyToSnippet: updated.replyToSnippet || null,
        reactions: {},
      };
      emitToUser(actor.id, "chat:message-updated", payload);
      emitToUser(peerId, "chat:message-updated", payload);
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi sửa tin nhắn");
    }
  }
);

app.post(
  "/chat/direct/messages/:id/reactions",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("emoji").isString().trim().isLength({ min: 1, max: 16 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const id = Number(req.params.id);
      const emoji = String(req.body.emoji || "").trim();
      const message = await prisma.directMessage.findUnique({ where: { id } });
      if (!message) return res.status(404).send("Message not found");
      const isParticipant = Number(message.senderId) === Number(actor.id) || Number(message.receiverId) === Number(actor.id);
      if (!isParticipant) return res.status(403).send("Không có quyền thả cảm xúc tin nhắn này");

      const existing = await prisma.directMessageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId: id, userId: actor.id, emoji } },
      });
      if (existing) {
        await prisma.directMessageReaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.directMessageReaction.create({
          data: { messageId: id, userId: actor.id, emoji },
        });
      }
      const rows = await prisma.directMessageReaction.findMany({
        where: { messageId: id },
        include: { user: { select: { username: true } } },
      });
      const reactions = toReactionMap(rows);
      const payload = { id, reactions };
      emitToUser(message.senderId, "chat:message-updated", payload);
      emitToUser(message.receiverId, "chat:message-updated", payload);
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi thả cảm xúc");
    }
  }
);

app.post(
  "/chat/direct/:username/typing",
  authenticateToken,
  validateRequest([
    param("username").isString().trim().isLength({ min: 3, max: 120 }),
    body("typing").isBoolean(),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const peer = await prisma.user.findUnique({
        where: { username: String(req.params.username || "").trim() },
      });
      if (!peer || peer.isActive === false) return res.status(404).send("Peer user not found");

      const isTyping = Boolean(req.body.typing);
      const key = `${actor.id}:${peer.id}`;
      if (!isTyping) {
        directTypingState.delete(key);
      } else {
        directTypingState.set(key, Date.now() + 6000);
      }
      emitToUser(peer.id, "chat:typing", {
        fromUsername: actor.username,
        typing: isTyping,
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật trạng thái đang nhập");
    }
  }
);

app.get(
  "/chat/direct/:username/typing",
  authenticateToken,
  validateRequest([param("username").isString().trim().isLength({ min: 3, max: 120 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const peer = await prisma.user.findUnique({
        where: { username: String(req.params.username || "").trim() },
      });
      if (!peer || peer.isActive === false) return res.status(404).send("Peer user not found");

      const key = `${peer.id}:${actor.id}`;
      const expiresAt = Number(directTypingState.get(key) || 0);
      const peerTyping = expiresAt > Date.now();
      return res.json({ peerTyping });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải trạng thái đang nhập");
    }
  }
);

app.post(
  "/chat/direct/:username/read",
  authenticateToken,
  validateRequest([param("username").isString().trim().isLength({ min: 3, max: 120 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const peer = await prisma.user.findUnique({
        where: { username: String(req.params.username || "").trim() },
      });
      if (!peer) return res.status(404).send("Peer user not found");

      const result = await prisma.directMessage.updateMany({
        where: {
          senderId: peer.id,
          receiverId: actor.id,
          isDeleted: false,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      emitToUser(peer.id, "chat:read", {
        byUsername: actor.username,
      });
      return res.json({ updatedCount: result.count || 0 });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật trạng thái đã đọc");
    }
  }
);

app.delete(
  "/chat/direct/:username/conversation",
  authenticateToken,
  validateRequest([param("username").isString().trim().isLength({ min: 3, max: 120 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const peerUsername = String(req.params.username || "").trim();
      const peer = await prisma.user.findUnique({ where: { username: peerUsername } });
      if (!peer || peer.isActive === false) return res.status(404).send("Peer user not found");
      // Teams-like behavior: hide conversation only for actor.
      const fromActor = await prisma.directMessage.updateMany({
        where: {
          senderId: actor.id,
          receiverId: peer.id,
        },
        data: { senderHidden: true },
      });
      const toActor = await prisma.directMessage.updateMany({
        where: {
          senderId: peer.id,
          receiverId: actor.id,
        },
        data: { receiverHidden: true },
      });
      emitToUser(actor.id, "chat:conversation-deleted", { username: peer.username });
      return res.json({
        ok: true,
        deletedCount: Number((fromActor?.count || 0) + (toActor?.count || 0)),
        username: peer.username,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa hội thoại");
    }
  }
);

app.get("/chat/groups", authenticateToken, async (req, res) => {
  try {
    const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!actor) return res.status(404).send("User not found");
    const memberships = await prisma.groupChatMember.findMany({
      where: { userId: actor.id },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, username: true, fullName: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    const groupIds = memberships.map((item) => item.groupId);
    const latestMessages = await prisma.groupChatMessage.findMany({
      where: { groupId: { in: groupIds } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { sender: { select: { username: true, fullName: true } } },
    });
    const latestByGroupId = new Map();
    for (const message of latestMessages) {
      if (!latestByGroupId.has(message.groupId)) {
        latestByGroupId.set(message.groupId, message);
      }
    }
    const unreadByGroupId = {};
    const mentionUnreadByGroupId = {};
    for (const membership of memberships) {
      const count = await prisma.groupChatMessage.count({
        where: {
          groupId: membership.groupId,
          createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
          senderId: { not: actor.id },
          isDeleted: false,
        },
      });
      unreadByGroupId[membership.groupId] = count;
      const mentionCount = await prisma.groupChatMessage.count({
        where: {
          groupId: membership.groupId,
          createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
          senderId: { not: actor.id },
          isDeleted: false,
          mentions: {
            some: {
              userId: actor.id,
            },
          },
        },
      });
      mentionUnreadByGroupId[membership.groupId] = mentionCount;
    }
    const rows = memberships
      .map((membership) => {
        const group = membership.group;
        const lastMessage = latestByGroupId.get(group.id) || null;
        return {
          id: group.id,
          name: group.name,
          ownerId: group.ownerId,
          unreadCount: unreadByGroupId[group.id] || 0,
          mentionUnreadCount: mentionUnreadByGroupId[group.id] || 0,
          members: group.members.map((member) => ({
            id: member.user.id,
            username: member.user.username,
            fullName: member.user.fullName,
            avatarUrl: member.user.avatarUrl || null,
            online: isUserOnlineBySocket(member.user.id),
            isAdmin: Boolean(member.isAdmin),
          })),
          lastMessageText: lastMessage
            ? lastMessage.isDeleted
              ? "[Đã thu hồi tin nhắn]"
              : lastMessage.attachmentName
                ? `[Tệp đính kèm] ${lastMessage.attachmentName}`
                : lastMessage.content || ""
            : "",
          lastMessageAt: lastMessage?.createdAt || null,
          lastMessageBy: lastMessage
            ? (lastMessage.sender.fullName || lastMessage.sender.username)
            : null,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return String(a.name || "").localeCompare(String(b.name || ""), "vi", { sensitivity: "base" });
      });
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi tải nhóm chat");
  }
});

app.post(
  "/chat/groups",
  authenticateToken,
  validateRequest([
    body("name").isString().trim().isLength({ min: 2, max: 80 }),
    body("memberUsernames").isArray({ min: 1, max: 30 }),
    body("memberUsernames.*").isString().trim().isLength({ min: 3, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupName = String(req.body.name || "").trim();
      const usernames = [...new Set((req.body.memberUsernames || []).map((item) => String(item || "").trim()))]
        .filter(Boolean)
        .filter((username) => username !== actor.username);
      const users = await prisma.user.findMany({
        where: { username: { in: usernames }, isActive: true },
        select: { id: true, username: true },
      });
      const memberIds = [...new Set([actor.id, ...users.map((item) => item.id)])];
      const created = await prisma.groupChat.create({
        data: {
          name: groupName,
          ownerId: actor.id,
          members: {
            create: memberIds.map((userId) => ({ userId, isAdmin: Number(userId) === Number(actor.id) })),
          },
        },
      });
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-updated", { groupId: created.id });
      }
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_CREATED",
        groupId: created.id,
        groupName: created.name,
        details: { memberCount: memberIds.length },
      });
      return res.status(201).json({ id: created.id, name: created.name });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tạo nhóm chat");
    }
  }
);

app.get(
  "/chat/groups/:id/messages",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 }), query("limit").optional().isInt({ min: 1, max: 200 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      const limit = Number(req.query.limit || 100);
      const rows = await prisma.groupChatMessage.findMany({
        where: { groupId },
        orderBy: { id: "asc" },
        take: limit,
        include: {
          sender: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
          mentions: { select: { username: true, userId: true } },
          reactions: { include: { user: { select: { username: true } } } },
        },
      });
      return res.json(
        rows.map((item) => ({
          id: item.id,
          groupId: item.groupId,
          content: item.isDeleted ? "" : item.content,
          attachmentUrl: item.attachmentUrl || null,
          attachmentName: item.attachmentName || null,
          attachmentMime: item.attachmentMime || null,
          attachmentSize: item.attachmentSize || null,
          replyToMessageId: item.replyToMessageId || null,
          replyToSender: item.replyToSender || null,
          replyToSnippet: item.replyToSnippet || null,
          createdAt: item.createdAt,
          editedAt: item.editedAt || null,
          isDeleted: Boolean(item.isDeleted),
          senderId: item.sender.id,
          senderUsername: item.sender.username,
          senderFullName: item.sender.fullName || null,
          senderAvatarUrl: item.sender.avatarUrl || null,
          isMine: item.senderId === actor.id,
          mentions: item.mentions.map((mention) => mention.username),
          mentionMe: item.mentions.some((mention) => Number(mention.userId) === Number(actor.id)),
          reactions: toReactionMap(item.reactions),
        }))
      );
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải tin nhắn nhóm");
    }
  }
);

app.post(
  "/chat/groups/:id/messages",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("content").isString().trim().isLength({ min: 1, max: 2000 }),
    body("replyToId").optional().isInt({ min: 1 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền gửi tin vào nhóm chat");
      const content = String(req.body.content || "").trim();
      const replyToId = req.body.replyToId ? Number(req.body.replyToId) : null;
      let replyToMeta = {};
      if (replyToId) {
        const quoted = await prisma.groupChatMessage.findUnique({ where: { id: replyToId } });
        const canQuote = quoted && Number(quoted.groupId) === Number(groupId);
        if (canQuote) {
          const quotedSender = await prisma.user.findUnique({
            where: { id: quoted.senderId },
            select: { username: true, fullName: true },
          });
          const snippetBase = quoted.isDeleted
            ? "Tin nhắn đã thu hồi"
            : quoted.attachmentName
              ? `[Tệp] ${quoted.attachmentName}`
              : (quoted.content || "");
          replyToMeta = {
            replyToMessageId: quoted.id,
            replyToSender: quotedSender?.fullName || quotedSender?.username || null,
            replyToSnippet: String(snippetBase).slice(0, 180),
          };
        }
      }
      const mentionTargets = extractMentionTargets(content);
      const groupMembers = await prisma.groupChatMember.findMany({
        where: { groupId },
        include: { user: { select: { id: true, username: true, fullName: true } } },
      });
      const usersByUsername = new Map();
      const usersByFullName = new Map();
      for (const item of groupMembers) {
        const usernameKey = String(item.user.username || "").trim().toLowerCase();
        const fullNameKey = String(item.user.fullName || "").trim().toLowerCase();
        if (usernameKey) usersByUsername.set(usernameKey, item.user);
        if (fullNameKey) usersByFullName.set(fullNameKey, item.user);
      }
      const mentionUsers = new Map();
      for (const username of mentionTargets.usernames || []) {
        const found = usersByUsername.get(String(username || "").trim().toLowerCase());
        if (found) mentionUsers.set(found.id, found);
      }
      for (const fullName of mentionTargets.fullNames || []) {
        const found = usersByFullName.get(String(fullName || "").trim().toLowerCase());
        if (found) mentionUsers.set(found.id, found);
      }
      const created = await prisma.groupChatMessage.create({
        data: {
          groupId,
          senderId: actor.id,
          content,
          ...replyToMeta,
          mentions: {
            create: [...mentionUsers.values()].map((user) => ({ userId: user.id, username: user.username })),
          },
        },
        include: {
          mentions: { select: { username: true, userId: true } },
        },
      });
      const payload = {
        id: created.id,
        groupId: created.groupId,
        content: created.content,
        attachmentUrl: created.attachmentUrl || null,
        attachmentName: created.attachmentName || null,
        attachmentMime: created.attachmentMime || null,
        attachmentSize: created.attachmentSize || null,
        replyToMessageId: created.replyToMessageId || null,
        replyToSender: created.replyToSender || null,
        replyToSnippet: created.replyToSnippet || null,
        createdAt: created.createdAt,
        editedAt: created.editedAt || null,
        isDeleted: Boolean(created.isDeleted),
        senderId: actor.id,
        senderUsername: actor.username,
        senderFullName: actor.fullName || null,
        senderAvatarUrl: actor.avatarUrl || null,
        mentions: created.mentions.map((mention) => mention.username),
        reactions: {},
      };
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-message", {
          ...payload,
          isMine: Number(userId) === Number(actor.id),
          mentionMe: created.mentions.some((mention) => Number(mention.userId) === Number(userId)),
        });
      }
      return res.status(201).json({
        ...payload,
        isMine: true,
        mentionMe: created.mentions.some((mention) => Number(mention.userId) === Number(actor.id)),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi gửi tin nhắn nhóm");
    }
  }
);

app.post(
  "/chat/groups/:id/attachment",
  authenticateToken,
  chatUpload.single("file"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("replyToId").optional().isInt({ min: 1 }),
    body("content").optional().isString().isLength({ max: 2000 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền gửi tin vào nhóm chat");
      if (!req.file) return res.status(400).send("Thiếu tệp đính kèm");
      const content = String(req.body.content || "").trim();
      const replyToId = req.body.replyToId ? Number(req.body.replyToId) : null;
      let replyToMeta = {};
      if (replyToId) {
        const quoted = await prisma.groupChatMessage.findUnique({ where: { id: replyToId } });
        const canQuote = quoted && Number(quoted.groupId) === Number(groupId);
        if (canQuote) {
          const quotedSender = await prisma.user.findUnique({
            where: { id: quoted.senderId },
            select: { username: true, fullName: true },
          });
          const snippetBase = quoted.isDeleted
            ? "Tin nhắn đã thu hồi"
            : quoted.attachmentName
              ? `[Tệp] ${quoted.attachmentName}`
              : (quoted.content || "");
          replyToMeta = {
            replyToMessageId: quoted.id,
            replyToSender: quotedSender?.fullName || quotedSender?.username || null,
            replyToSnippet: String(snippetBase).slice(0, 180),
          };
        }
      }
      const created = await prisma.groupChatMessage.create({
        data: {
          groupId,
          senderId: actor.id,
          content,
          attachmentUrl: req.file.filename,
          attachmentName: req.file.originalname,
          attachmentMime: req.file.mimetype || null,
          attachmentSize: Number(req.file.size || 0),
          ...replyToMeta,
        },
        include: {
          mentions: { select: { username: true, userId: true } },
        },
      });
      const payload = {
        id: created.id,
        groupId: created.groupId,
        content: created.content || "",
        attachmentUrl: created.attachmentUrl || null,
        attachmentName: created.attachmentName || null,
        attachmentMime: created.attachmentMime || null,
        attachmentSize: created.attachmentSize || null,
        replyToMessageId: created.replyToMessageId || null,
        replyToSender: created.replyToSender || null,
        replyToSnippet: created.replyToSnippet || null,
        createdAt: created.createdAt,
        editedAt: created.editedAt || null,
        isDeleted: Boolean(created.isDeleted),
        senderId: actor.id,
        senderUsername: actor.username,
        senderFullName: actor.fullName || null,
        senderAvatarUrl: actor.avatarUrl || null,
        mentions: [],
        reactions: {},
      };
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-message", {
          ...payload,
          isMine: Number(userId) === Number(actor.id),
          mentionMe: false,
        });
      }
      return res.status(201).json({ ...payload, isMine: true, mentionMe: false });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi gửi tệp đính kèm vào nhóm");
    }
  }
);

app.post(
  "/chat/groups/:id/messages/:messageId/reactions",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    param("messageId").isInt({ min: 1 }),
    body("emoji").isString().trim().isLength({ min: 1, max: 16 }),
  ]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const messageId = Number(req.params.messageId);
      const emoji = String(req.body.emoji || "").trim();
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền thả cảm xúc trong nhóm này");
      const message = await prisma.groupChatMessage.findUnique({ where: { id: messageId } });
      if (!message || Number(message.groupId) !== Number(groupId)) return res.status(404).send("Message not found");

      const existing = await prisma.groupChatMessageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId: actor.id, emoji } },
      });
      if (existing) {
        await prisma.groupChatMessageReaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.groupChatMessageReaction.create({
          data: { messageId, userId: actor.id, emoji },
        });
      }
      const rows = await prisma.groupChatMessageReaction.findMany({
        where: { messageId },
        include: { user: { select: { username: true } } },
      });
      const reactions = toReactionMap(rows);
      const payload = { id: messageId, groupId, reactions };
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-message-updated", payload);
      }
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi thả cảm xúc");
    }
  }
);

app.get(
  "/chat/groups/:id/messages/:messageId/download",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 }), param("messageId").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const messageId = Number(req.params.messageId);
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền tải tệp");
      const message = await prisma.groupChatMessage.findUnique({ where: { id: messageId } });
      if (!message || Number(message.groupId) !== Number(groupId)) return res.status(404).send("Message not found");
      if (!message.attachmentUrl) return res.status(404).send("Không có tệp đính kèm");
      const filePath = path.join(__dirname, "uploads", path.basename(message.attachmentUrl));
      if (!fs.existsSync(filePath)) return res.status(404).send("Tệp không tồn tại");
      return res.download(filePath, message.attachmentName || path.basename(message.attachmentUrl));
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi tải tệp đính kèm");
    }
  }
);

app.delete(
  "/chat/groups/:id/messages/:messageId",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 }), param("messageId").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const messageId = Number(req.params.messageId);
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      const message = await prisma.groupChatMessage.findUnique({ where: { id: messageId } });
      if (!message || Number(message.groupId) !== Number(groupId)) return res.status(404).send("Message not found");
      if (Number(message.senderId) !== Number(actor.id)) return res.status(403).send("Không thể xóa tin nhắn của người khác");

      const updated = await prisma.groupChatMessage.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          content: "",
        },
      });
      const payload = {
        id: updated.id,
        groupId: updated.groupId,
        content: "",
        attachmentUrl: updated.attachmentUrl || null,
        attachmentName: updated.attachmentName || null,
        attachmentMime: updated.attachmentMime || null,
        attachmentSize: updated.attachmentSize || null,
        replyToMessageId: updated.replyToMessageId || null,
        replyToSender: updated.replyToSender || null,
        replyToSnippet: updated.replyToSnippet || null,
        createdAt: updated.createdAt,
        editedAt: updated.editedAt || null,
        isDeleted: true,
        reactions: {},
      };
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-message-updated", payload);
      }
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa tin nhắn nhóm");
    }
  }
);

app.post(
  "/chat/groups/:id/read",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const actor = await prisma.user.findUnique({ where: { username: req.user.username } });
      if (!actor) return res.status(404).send("User not found");
      const groupId = Number(req.params.id);
      const membership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      await prisma.groupChatMember.update({
        where: { groupId_userId: { groupId, userId: actor.id } },
        data: { lastReadAt: new Date() },
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-read", {
          groupId,
          byUsername: actor.username,
        });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật đã đọc nhóm chat");
    }
  }
);

app.patch(
  "/chat/groups/:id",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("name").isString().trim().isLength({ min: 2, max: 80 }),
  ]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (Number(group.ownerId) !== Number(actor.id)) return res.status(403).send("Chỉ người có quyền sở hữu nhóm mới có thể xóa nhóm");
      const nextName = String(req.body.name || "").trim();
      const updated = await prisma.groupChat.update({
        where: { id: groupId },
        data: { name: nextName },
      });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_RENAMED",
        groupId,
        groupName: updated.name,
        details: { previousName: group.name, nextName },
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-updated", { groupId, name: updated.name });
      }
      return res.json({ id: updated.id, name: updated.name });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật nhóm chat");
    }
  }
);

app.post(
  "/chat/groups/:id/members",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("username").isString().trim().isLength({ min: 3, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (!canManageGroup({ actor, group, membership })) return res.status(403).send("Không có quyền quản trị nhóm");
      const username = String(req.body.username || "").trim();
      const target = await prisma.user.findUnique({ where: { username } });
      if (!target || target.isActive === false) return res.status(404).send("User not found");
      await prisma.groupChatMember.upsert({
        where: { groupId_userId: { groupId, userId: target.id } },
        update: {},
        create: { groupId, userId: target.id },
      });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_MEMBER_ADDED",
        groupId,
        groupName: group.name,
        targetUsername: target.username,
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-updated", { groupId });
      }
      return res.json({ ok: true, username: target.username });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi thêm thành viên nhóm");
    }
  }
);

app.delete(
  "/chat/groups/:id/members/:username",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    param("username").isString().trim().isLength({ min: 3, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (!canManageGroup({ actor, group, membership })) return res.status(403).send("Không có quyền quản trị nhóm");
      const username = String(req.params.username || "").trim();
      const target = await prisma.user.findUnique({ where: { username } });
      if (!target) return res.status(404).send("User not found");
      if (Number(target.id) === Number(group.ownerId)) return res.status(400).send("Không thể xóa người có quyền sở hữu nhóm khỏi nhóm");
      await prisma.groupChatMember.deleteMany({
        where: { groupId, userId: target.id },
      });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_MEMBER_REMOVED",
        groupId,
        groupName: group.name,
        targetUsername: target.username,
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of [...memberIds, target.id]) {
        emitToUser(userId, "chat:group-updated", { groupId });
      }
      return res.json({ ok: true, username: target.username });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa thành viên nhóm");
    }
  }
);

app.post(
  "/chat/groups/:id/admins",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("username").isString().trim().isLength({ min: 3, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (!canManageGroup({ actor, group, membership })) return res.status(403).send("Không có quyền quản trị nhóm");
      const username = String(req.body.username || "").trim();
      const target = await prisma.user.findUnique({ where: { username } });
      if (!target) return res.status(404).send("User not found");
      const targetMembership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: target.id } },
      });
      if (!targetMembership) return res.status(404).send("User chưa là thành viên nhóm");
      await prisma.groupChatMember.update({
        where: { groupId_userId: { groupId, userId: target.id } },
        data: { isAdmin: true },
      });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_ADMIN_PROMOTED",
        groupId,
        groupName: group.name,
        targetUsername: target.username,
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) emitToUser(userId, "chat:group-updated", { groupId });
      return res.json({ ok: true, username: target.username, isAdmin: true });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cấp quyền quản trị nhóm");
    }
  }
);

app.delete(
  "/chat/groups/:id/admins/:username",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    param("username").isString().trim().isLength({ min: 3, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (!canManageGroup({ actor, group, membership })) return res.status(403).send("Không có quyền quản trị nhóm");
      const username = String(req.params.username || "").trim();
      const target = await prisma.user.findUnique({ where: { username } });
      if (!target) return res.status(404).send("User not found");
      if (Number(target.id) === Number(group.ownerId)) return res.status(400).send("Không thể gỡ quyền sở hữu nhóm");
      const targetMembership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: target.id } },
      });
      if (!targetMembership) return res.status(404).send("User chưa là thành viên nhóm");
      await prisma.groupChatMember.update({
        where: { groupId_userId: { groupId, userId: target.id } },
        data: { isAdmin: false },
      });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_ADMIN_DEMOTED",
        groupId,
        groupName: group.name,
        targetUsername: target.username,
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) emitToUser(userId, "chat:group-updated", { groupId });
      return res.json({ ok: true, username: target.username, isAdmin: false });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi gỡ quyền quản trị nhóm");
    }
  }
);

app.post(
  "/chat/groups/:id/transfer-owner",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("username").isString().trim().isLength({ min: 3, max: 120 }),
  ]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (!canTransferGroupOwnership({ actor, group })) return res.status(403).send("Không có quyền chuyển quyền sở hữu nhóm");
      const username = String(req.body.username || "").trim();
      const target = await prisma.user.findUnique({ where: { username } });
      if (!target) return res.status(404).send("User not found");
      const targetMembership = await prisma.groupChatMember.findUnique({
        where: { groupId_userId: { groupId, userId: target.id } },
      });
      if (!targetMembership) return res.status(404).send("User chưa là thành viên nhóm");
      if (Number(target.id) === Number(group.ownerId)) {
        return res.status(400).send("Người dùng này đã có quyền sở hữu nhóm");
      }
      await prisma.$transaction([
        prisma.groupChat.update({
          where: { id: groupId },
          data: { ownerId: target.id },
        }),
        prisma.groupChatMember.update({
          where: { groupId_userId: { groupId, userId: target.id } },
          data: { isAdmin: true },
        }),
      ]);
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_OWNER_TRANSFERRED",
        groupId,
        groupName: group.name,
        targetUsername: target.username,
        details: { previousOwnerId: group.ownerId, nextOwnerId: target.id },
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of memberIds) emitToUser(userId, "chat:group-updated", { groupId });
      return res.json({ ok: true, ownerUsername: target.username });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi chuyển quyền sở hữu nhóm chat");
    }
  }
);

app.post(
  "/chat/groups/:id/leave",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (Number(group.ownerId) === Number(actor.id)) {
        return res.status(400).send("Người có quyền sở hữu nhóm không thể rời nhóm. Hãy xóa nhóm hoặc chuyển quyền sở hữu nhóm.");
      }
      await prisma.groupChatMember.delete({
        where: { groupId_userId: { groupId, userId: actor.id } },
      });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_MEMBER_LEFT",
        groupId,
        groupName: group.name,
      });
      const memberIds = await getGroupMemberUserIds(groupId);
      for (const userId of [...memberIds, actor.id]) {
        emitToUser(userId, "chat:group-updated", { groupId });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi rời nhóm chat");
    }
  }
);

app.delete(
  "/chat/groups/:id",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const { actor, group, membership } = await getActorAndGroupMembership(req, groupId);
      if (!actor) return res.status(404).send("User not found");
      if (!group) return res.status(404).send("Group not found");
      if (!membership) return res.status(403).send("Không có quyền truy cập nhóm chat");
      if (!canManageGroup({ actor, group, membership })) return res.status(403).send("Không có quyền quản trị nhóm");
      const memberIds = await getGroupMemberUserIds(groupId);
      await prisma.groupChat.delete({ where: { id: groupId } });
      await createGroupManagementAuditLog({
        actorUsername: actor.username,
        action: "GROUP_CHAT_DELETED",
        groupId,
        groupName: group.name,
        details: { memberCount: memberIds.length },
      });
      for (const userId of memberIds) {
        emitToUser(userId, "chat:group-updated", { groupId, deleted: true });
      }
      return res.json({ ok: true, id: groupId });
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xóa nhóm chat");
    }
  }
);

app.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!user) {
      return res.status(404).send("User not found");
    }
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(
      notifications.map((item) => ({
        ...item,
        message: normalizeLegacyNotificationMessage(item.message),
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi lấy thông báo");
  }
});

app.get(
  "/files/:fileId/download",
  authenticateToken,
  validateRequest([param("fileId").isInt({ min: 1 })]),
  async (req, res) => {
    const fileId = Number(req.params.fileId);
    try {
      const file = await prisma.file.findUnique({ where: { id: fileId } });
      if (!file) {
        return res.status(404).send("File not found");
      }

      const filePath = path.join(__dirname, "uploads", path.basename(file.url));
      if (!fs.existsSync(filePath)) {
        return res.status(404).send("Physical file not found");
      }
      return res.download(filePath, file.filename);
    } catch (error) {
      console.error(error);
      return res.status(500).send("File download failed");
    }
  }
);

app.post(
  "/notifications/:id/read",
  authenticateToken,
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
  const id = Number(req.params.id);
  try {
    const user = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!user) {
      return res.status(404).send("User not found");
    }

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== user.id) {
      return res.status(404).send("Notification not found");
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { status: "read" },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi cập nhật thông báo");
  }
});

app.post("/notifications/read-all", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!user) {
      return res.status(404).send("User not found");
    }
    const updated = await prisma.notification.updateMany({
      where: { userId: user.id, status: "unread" },
      data: { status: "read" },
    });
    return res.json({ updatedCount: updated.count || 0 });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi đánh dấu đã đọc tất cả thông báo");
  }
});

app.delete("/notifications/read", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!user) {
      return res.status(404).send("User not found");
    }
    const deleted = await prisma.notification.deleteMany({
      where: { userId: user.id, status: "read" },
    });
    return res.json({ deletedCount: deleted.count || 0 });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Lỗi xóa thông báo đã đọc");
  }
});

app.delete(
  "/cases/:id/files/:fileIndex",
  authenticateToken,
  async (req, res) => {
    const id = Number(req.params.id);
    const fileIndex = Number(req.params.fileIndex);

    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: { files: { orderBy: { id: "asc" } } },
      });
      if (!caseItem) {
        return res.status(404).send("Case not found");
      }
      if (!ensureCaseNotLocked(caseItem, res)) return;

      const fileToDelete = caseItem.files[fileIndex];
      if (!fileToDelete) {
        return res.status(404).send("File not found");
      }

      await prisma.file.delete({ where: { id: fileToDelete.id } });
      const uploadPath = path.join(__dirname, "uploads", path.basename(fileToDelete.url));
      if (fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
      }

      await prisma.auditLog.create({
        data: {
          caseId: id,
          action: "FILE_DELETED",
          notes: fileToDelete.filename,
          user: req.user.username,
        },
      });

      res.json({ message: "Xóa file thành công" });
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi xóa file");
    }
  }
);

app.put(
  "/cases/:id/fee",
  authenticateToken,
  checkPermission("manage_receipts"),
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("feeAmount").optional().isFloat({ min: 0 }),
    body("feePaid").optional().isFloat({ min: 0 }),
    body("feeReceiptNo").optional().isString().isLength({ max: 50 }),
    body("paymentMethod").optional().isIn(Object.values(PAYMENT_METHODS)),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { feeAmount, feePaid, feeReceiptNo, paymentMethod } = req.body;

    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!ensureCaseNotLocked(caseItem, res)) return;
      if (!ensureCaseAssignmentAccess(req, res, caseItem, { allowAccountant: true })) return;
      const nextFeeAmount = feeAmount ?? caseItem.feeAmount;
      const nextFeePaid = feePaid ?? caseItem.feePaid;
      if (Number(nextFeePaid) > Number(nextFeeAmount)) {
        return res.status(400).send("Số tiền đã thu không được lớn hơn tổng phí");
      }
      const thresholdError = validateFeeThresholdForStatus(caseItem.status, nextFeeAmount, nextFeePaid);
      if (thresholdError) {
        return res.status(400).send(thresholdError);
      }
      let nextReceiptNo = feeReceiptNo ?? caseItem.feeReceiptNo;
      if (!nextReceiptNo && Number(nextFeePaid) > 0) {
        nextReceiptNo = await generateReceiptNumber();
      }
      const nextPaymentMethod =
        paymentMethod ??
        caseItem.paymentMethod ??
        (Number(nextFeePaid) > 0 ? PAYMENT_METHODS.CASH : null);

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          feeAmount: nextFeeAmount,
          feePaid: nextFeePaid,
          feeReceiptNo: nextReceiptNo,
          paymentMethod: nextPaymentMethod,
          history: {
            create: {
              action: "FEE_UPDATED",
              notes: `Fee ${feePaid ?? caseItem.feePaid}/${feeAmount ?? caseItem.feeAmount}; method=${nextPaymentMethod || "-"}`,
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true, customer: true },
      });
      await autoAdvanceFinancialWorkflow(updatedCase.id, req.user?.username);
      const refreshedCase = await prisma.case.findUnique({
        where: { id: updatedCase.id },
        include: { files: true, history: true, customer: true },
      });
      return res.json(refreshedCase || updatedCase);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi cập nhật thông tin phí");
    }
  }
);

app.post(
  "/cases/:id/issue",
  authenticateToken,
  checkPermission("notarize_case"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({
        where: { id },
        include: { files: true },
      });
      if (!caseItem) return res.status(404).send("Case not found");
      if (!ensureCaseNotLocked(caseItem, res)) return;
      if (!ensureCaseAssignmentAccess(req, res, caseItem)) return;
      if (caseItem.status !== WORKFLOW_STATUS.APPROVED) {
        return res.status(400).send("Chỉ được phát hành khi hồ sơ đã ở trạng thái ĐÃ DUYỆT");
      }
      if (!caseItem.feeAmount || caseItem.feePaid < caseItem.feeAmount) {
        return res.status(400).send("Chưa thu đủ phí, không thể phát hành");
      }

      const missing = getMissingRequiredFileTypes(caseItem);
      if (missing.length > 0) {
        return res.status(400).json({
          message: "Không thể phát hành số công chứng vì thiếu tài liệu",
          missingFileTypes: missing,
        });
      }

      if (caseItem.caseCategory === CASE_CATEGORIES.INHERITANCE) {
        if (caseItem.inheritancePostingResult !== INHERITANCE_POSTING_RESULTS.NO_CLAIM) {
          return res
            .status(400)
            .send(
              "Hồ sơ thừa kế phải có kết quả niêm yết NO_CLAIM (đủ 15 ngày, không khiếu nại) trước khi phát hành"
            );
        }
      }

      const { bookNumber, recordNumber } = await generateNotaryNumbers();
      const archivalRetentionUntil = calculateArchiveRetentionUntil(new Date());
      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          notaryBookNumber: bookNumber,
          notaryRecordNumber: recordNumber,
          issuedAt: new Date(),
          publicTrackingCode: caseItem.publicTrackingCode || (await generateUniquePublicTrackingCode()),
          publicTrackingEnabled: true,
          archivalRetentionUntil,
          isLocked: true,
          status: WORKFLOW_STATUS.NOTARIZED,
          history: {
            create: {
              action: "ISSUED",
              fromStatus: caseItem.status,
              toStatus: WORKFLOW_STATUS.NOTARIZED,
              notes: `${bookNumber}-${recordNumber}`,
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true, customer: true },
      });
      await notifyCaseStatusTransition({ caseItem, updatedCase, actorUsername: req.user?.username });

      return res.json(updatedCase);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi phát hành số công chứng");
    }
  }
);

app.post(
  "/cases/:id/unlock",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([param("id").isInt({ min: 1 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Case not found");

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          isLocked: false,
          history: {
            create: {
              action: "UNLOCKED",
              notes: "Administrative unlock",
              user: req.user.username,
            },
          },
        },
        include: { files: true, history: true },
      });
      return res.json(updatedCase);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi mở khóa hồ sơ");
    }
  }
);

app.get(
  "/notary-register/export",
  authenticateToken,
  validateRequest([
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("lang").optional().isIn(["vi", "en"]),
  ]),
  async (req, res) => {
    try {
      const role = req.user?.role;
      const lang = String(req.query.lang || "vi").toLowerCase() === "en" ? "en" : "vi";
      if (!NOTARY_REGISTER_EXPORT_ROLES.includes(role)) {
        await createAccessAuditLog({
          req,
          action: "REPORT_EXPORT_DENIED",
          notes: "notary-register",
          details: { role },
        });
        return res.status(403).send("Insufficient permissions for this report");
      }
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      const where = {
        notaryRecordNumber: { not: null },
      };
      if (from || to) {
        where.issuedAt = {};
        if (from) where.issuedAt.gte = from;
        if (to) where.issuedAt.lte = to;
      }
      const notaryCases = await prisma.case.findMany({
        where,
        orderBy: [{ issuedAt: "asc" }, { notaryRecordNumber: "asc" }],
      });
      const rows = [
        lang === "en"
          ? [
              "BookNo",
              "NotaryRecordNo",
              "CaseId",
              "Customer",
              "CaseType",
              "IssuedAt",
              "TotalFee",
              "PaidAmount",
              "ReceiptNo",
            ]
          : [
              "SoQuyen",
              "SoCongChung",
              "MaHoSo",
              "KhachHang",
              "LoaiViec",
              "NgayPhatHanh",
              "TongPhi",
              "DaThu",
              "SoPhieuThu",
            ],
      ];
      for (const item of notaryCases) {
        rows.push([
          item.notaryBookNumber || "",
          item.notaryRecordNumber || "",
          item.caseId,
          item.customerName,
          toCaseTypeLabelByLang(item.type, lang),
          item.issuedAt ? new Date(item.issuedAt).toISOString() : "",
          item.feeAmount ?? 0,
          item.feePaid ?? 0,
          item.feeReceiptNo || "",
        ]);
      }
      const csv = rows
        .map((line) =>
          line
            .map((value) => {
              const raw = String(value ?? "");
              if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
                return `"${raw.replace(/"/g, '""')}"`;
              }
              return raw;
            })
            .join(",")
        )
        .join("\n");
      const stamp = getVietnamDateStamp();
      await createAccessAuditLog({
        req,
        action: "REPORT_EXPORTED",
        notes: "notary-register",
        details: { from: req.query.from || null, to: req.query.to || null },
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${lang === "en" ? `NotaryRegister_${stamp}.csv` : `SoCongChung_${stamp}.csv`}"`
      );
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      console.error(error);
      return res.status(500).send("Lỗi xuất sổ công chứng");
    }
  }
);

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `Tệp đính kèm vượt quá giới hạn ${CHAT_UPLOAD_MAX_MB}MB.`,
      });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message || "Invalid request" });
  }
  return next();
});

async function runOverdueNotificationJob() {
  try {
    const overdueCases = await prisma.case.findMany({
      where: {
        isDeleted: false,
        deadline: { lt: new Date() },
        status: { notIn: [WORKFLOW_STATUS.ARCHIVED, WORKFLOW_STATUS.CANCELLED] },
        assignedTo: { not: null },
      },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    for (const caseItem of overdueCases) {
      const assignee = await prisma.user.findUnique({
        where: { username: caseItem.assignedTo },
      });
      if (!assignee) continue;

      const existingToday = await prisma.notification.count({
        where: {
          userId: assignee.id,
          caseId: caseItem.id,
          type: "warning",
          createdAt: { gte: startOfDay },
        },
      });

      if (existingToday === 0) {
        const overdueDays = Math.ceil(
          (Date.now() - new Date(caseItem.deadline).getTime()) / (1000 * 60 * 60 * 24)
        );
        await prisma.notification.create({
          data: {
            userId: assignee.id,
            caseId: caseItem.id,
            message: `Hồ sơ ${caseItem.caseId} đã quá hạn ${overdueDays} ngày`,
            type: "warning",
            actionUrl: `/cases/${caseItem.id}`,
          },
        });
      }
    }
  } catch (error) {
    console.error("Overdue job error:", error);
  }
}

// ================== CUSTOMER MANAGEMENT ==================
app.get("/customers", authenticateToken, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            cases: {
              where: { isDeleted: false },
            },
          },
        },
      },
    });
    res.json(
      customers.map((item) => ({
        ...item,
        totalCases: item._count?.cases || 0,
      }))
    );
    await createAccessAuditLog({
      req,
      action: "CUSTOMERS_VIEWED",
      details: { count: customers.length },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi khi lấy danh sách khách hàng");
  }
});

app.post(
  "/customers",
  authenticateToken,
  checkPermission("create_case"),
  validateRequest([
    body("fullName").isString().trim().isLength({ min: 2, max: 120 }),
    body("phone").isString().trim().isLength({ min: 8, max: 20 }),
    body("email").optional({ nullable: true, checkFalsy: true }).isEmail(),
    body("idNumber").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 20 }),
    body("gender").optional({ nullable: true, checkFalsy: true }).isIn(["MALE", "FEMALE", "OTHER"]),
    body("dateOfBirth").optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body("address").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 250 }),
    body("notes").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }),
  ]),
  async (req, res) => {
  const { fullName, phone, email, idNumber, gender, dateOfBirth, address, notes } = req.body;

  if (!fullName || !phone) {
    return res.status(400).send("Thiếu tên hoặc số điện thoại khách hàng");
  }

  try {
    const duplicateCustomer = await findDuplicateCustomerByPhoneOrIdNumber({
      phone,
      idNumber: idNumber || "",
    });
    if (duplicateCustomer) {
      return res.status(400).json({
        message: "Đã tồn tại khách hàng có số điện thoại hoặc CCCD trùng.",
        duplicateCustomer,
      });
    }
    const newCustomer = await prisma.customer.create({
      data: {
        customerId: `KH-${Date.now()}`,
        fullName,
        phone,
        email: email || "",
        idNumber: idNumber || "",
        gender: gender || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || "",
        notes: notes || "",
        createdBy: req.user.username,
        updatedBy: req.user.username,
      },
    });

    res.status(201).json(newCustomer);
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi tạo khách hàng");
  }
});

app.put(
  "/customers/:id",
  authenticateToken,
  validateRequest([
    param("id").isInt({ min: 1 }),
    body("fullName").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 2, max: 120 }),
    body("phone").optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ min: 8, max: 20 }),
    body("email").optional({ nullable: true, checkFalsy: true }).isEmail(),
    body("idNumber").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 20 }),
    body("gender").optional({ nullable: true, checkFalsy: true }).isIn(["MALE", "FEMALE", "OTHER"]),
    body("dateOfBirth").optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body("address").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 250 }),
    body("notes").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }),
  ]),
  async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, phone, email, idNumber, gender, dateOfBirth, address, notes } = req.body;

  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      return res.status(404).send("Khách hàng không tồn tại");
    }
    const isAdmin = hasPermission(req.user?.role, "manage_users");
    const canSelfManage =
      hasPermission(req.user?.role, "create_case") &&
      customer.createdBy &&
      (customer.createdBy === req.user.username || isLegacyActorLabel(customer.createdBy));
    if (!isAdmin && !canSelfManage) {
      return res
        .status(403)
        .send("Bạn không có quyền sửa khách hàng này (chỉ quản trị viên hoặc người tạo được sửa).");
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        fullName: fullName ?? customer.fullName,
        phone: phone ?? customer.phone,
        email: email ?? customer.email,
        idNumber: idNumber ?? customer.idNumber,
        gender: gender ?? customer.gender,
        dateOfBirth: dateOfBirth !== undefined ? (dateOfBirth ? new Date(dateOfBirth) : null) : customer.dateOfBirth,
        address: address ?? customer.address,
        notes: notes ?? customer.notes,
        updatedBy: req.user.username,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi cập nhật khách hàng");
  }
});

app.delete(
  "/customers/:id",
  authenticateToken,
  async (req, res) => {
    const id = Number(req.params.id);

    try {
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return res.status(404).send("Khách hàng không tồn tại");
      }
      const isAdmin = hasPermission(req.user?.role, "manage_users");
      const canSelfManage =
        hasPermission(req.user?.role, "create_case") &&
        customer.createdBy &&
        (customer.createdBy === req.user.username || isLegacyActorLabel(customer.createdBy));
      if (!isAdmin && !canSelfManage) {
        return res
          .status(403)
          .send("Bạn không có quyền xóa khách hàng này (chỉ quản trị viên hoặc người tạo được xóa).");
      }

      const linkedCases = await prisma.case.count({
        where: {
          customerId: id,
          isDeleted: false,
        },
      });
      if (linkedCases > 0) {
        return res
          .status(400)
          .send("Không thể xóa khách hàng đang có hồ sơ liên kết. Vui lòng lưu trữ hoặc chuyển hồ sơ trước.");
      }

      await prisma.customer.delete({ where: { id } });
      res.sendStatus(204);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi xóa khách hàng");
    }
  }
);

// ================== INHERITANCE (NIÊM YẾT) ==================
app.post(
  "/cases/:id/inheritance/start-posting",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([
    body("startedAt").optional().isISO8601(),
    body("notes").optional().isString().isLength({ max: 2000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { startedAt, notes } = req.body;
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Hồ sơ không tồn tại");
      if (caseItem.caseCategory !== CASE_CATEGORIES.INHERITANCE) {
        return res.status(400).send("Chỉ áp dụng cho hồ sơ thừa kế");
      }
      if (caseItem.isLocked) return res.status(409).send("Hồ sơ đang bị khóa");
      if (!ensureCaseAssignmentAccess(req, res, caseItem)) return;

      const start = startedAt ? new Date(startedAt) : new Date();
      const ends = new Date(start);
      ends.setDate(ends.getDate() + 15);

      const updated = await prisma.case.update({
        where: { id },
        data: {
          inheritancePostingStartedAt: start,
          inheritancePostingEndsAt: ends,
          inheritancePostingResult: INHERITANCE_POSTING_RESULTS.PENDING,
          inheritancePostingNotes: notes || caseItem.inheritancePostingNotes,
        },
      });
      await createCaseLegalAuditLog({
        caseId: id,
        actor: req.user.username,
        action: "INHERITANCE_POSTING_STARTED",
        notes: notes || "",
        details: { startedAt: start.toISOString(), endsAt: ends.toISOString() },
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi bắt đầu niêm yết");
    }
  }
);

app.post(
  "/cases/:id/inheritance/finalize-posting",
  authenticateToken,
  checkPermission("update_case"),
  validateRequest([
    body("result").isIn([
      INHERITANCE_POSTING_RESULTS.NO_CLAIM,
      INHERITANCE_POSTING_RESULTS.HAS_CLAIM,
    ]),
    body("notes").optional().isString().isLength({ max: 2000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    const { result, notes } = req.body;
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Hồ sơ không tồn tại");
      if (caseItem.caseCategory !== CASE_CATEGORIES.INHERITANCE) {
        return res.status(400).send("Chỉ áp dụng cho hồ sơ thừa kế");
      }
      if (!ensureCaseAssignmentAccess(req, res, caseItem)) return;
      if (!caseItem.inheritancePostingEndsAt) {
        return res.status(400).send("Chưa bắt đầu niêm yết");
      }
      if (new Date() < caseItem.inheritancePostingEndsAt) {
        return res
          .status(400)
          .send("Chưa hết 15 ngày niêm yết, không thể chốt kết quả");
      }
      const updated = await prisma.case.update({
        where: { id },
        data: {
          inheritancePostingResult: result,
          inheritancePostingNotes: notes || caseItem.inheritancePostingNotes,
        },
      });
      await createCaseLegalAuditLog({
        caseId: id,
        actor: req.user.username,
        action: "INHERITANCE_POSTING_FINALIZED",
        notes: notes || "",
        details: { result },
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi chốt niêm yết");
    }
  }
);

// ================== TRANSLATOR COLLABORATORS ==================
app.get("/translator-collaborators", authenticateToken, async (_req, res) => {
  try {
    const list = await prisma.translatorCollaborator.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi khi tải danh sách cộng tác viên dịch");
  }
});

app.post(
  "/translator-collaborators",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    body("fullName").isString().trim().isLength({ min: 2, max: 120 }),
    body("idNumber").optional().isString().isLength({ max: 30 }),
    body("languages").optional().isString().isLength({ max: 250 }),
    body("signatureSample").optional().isString().isLength({ max: 5000 }),
  ]),
  async (req, res) => {
    try {
      const created = await prisma.translatorCollaborator.create({
        data: {
          fullName: req.body.fullName,
          idNumber: req.body.idNumber || null,
          languages: req.body.languages || null,
          signatureSample: req.body.signatureSample || null,
          createdBy: req.user.username,
        },
      });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "TRANSLATOR_COLLABORATOR_CREATED",
        targetUsername: created.fullName,
        notes: `Languages: ${created.languages || ""}`,
      });
      res.status(201).json(created);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi tạo cộng tác viên dịch");
    }
  }
);

app.put(
  "/translator-collaborators/:id",
  authenticateToken,
  checkPermission("manage_users"),
  validateRequest([
    body("fullName").optional().isString().trim().isLength({ min: 2, max: 120 }),
    body("idNumber").optional().isString().isLength({ max: 30 }),
    body("languages").optional().isString().isLength({ max: 250 }),
    body("signatureSample").optional().isString().isLength({ max: 5000 }),
    body("isActive").optional().isBoolean(),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const updated = await prisma.translatorCollaborator.update({
        where: { id },
        data: {
          ...(req.body.fullName !== undefined && { fullName: req.body.fullName }),
          ...(req.body.idNumber !== undefined && { idNumber: req.body.idNumber }),
          ...(req.body.languages !== undefined && { languages: req.body.languages }),
          ...(req.body.signatureSample !== undefined && {
            signatureSample: req.body.signatureSample,
          }),
          ...(req.body.isActive !== undefined && { isActive: req.body.isActive }),
        },
      });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "TRANSLATOR_COLLABORATOR_UPDATED",
        targetUsername: updated.fullName,
        notes: req.body.isActive === false ? "Disabled" : "",
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi cập nhật cộng tác viên dịch");
    }
  }
);

app.delete(
  "/translator-collaborators/:id",
  authenticateToken,
  checkPermission("manage_users"),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const removed = await prisma.translatorCollaborator.delete({ where: { id } });
      await createUserSecurityAuditLog({
        actor: req.user.username,
        action: "TRANSLATOR_COLLABORATOR_DELETED",
        targetUsername: removed.fullName,
      });
      res.sendStatus(204);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi xóa cộng tác viên dịch");
    }
  }
);

// ================== COPY ISSUANCE REQUESTS (CẤP BẢN SAO) ==================
app.get(
  "/cases/:id/copy-requests",
  authenticateToken,
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const list = await prisma.copyIssuanceRequest.findMany({
        where: { caseId: id },
        orderBy: { createdAt: "desc" },
      });
      res.json(list);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi tải yêu cầu cấp bản sao");
    }
  }
);

app.post(
  "/cases/:id/copy-requests",
  authenticateToken,
  checkPermission("create_case"),
  validateRequest([
    body("requesterName").isString().trim().isLength({ min: 2, max: 120 }),
    body("requesterIdNumber").optional().isString().isLength({ max: 30 }),
    body("requesterRelation").isString().trim().isLength({ min: 2, max: 100 }),
    body("legalBasis").optional().isString().isLength({ max: 500 }),
    body("notes").optional().isString().isLength({ max: 2000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const caseItem = await prisma.case.findUnique({ where: { id } });
      if (!caseItem) return res.status(404).send("Hồ sơ không tồn tại");

      const created = await prisma.copyIssuanceRequest.create({
        data: {
          caseId: id,
          requesterName: req.body.requesterName,
          requesterIdNumber: req.body.requesterIdNumber || null,
          requesterRelation: req.body.requesterRelation,
          legalBasis: req.body.legalBasis || null,
          notes: req.body.notes || null,
          createdBy: req.user.username,
          status: "PENDING",
        },
      });
      await createCaseLegalAuditLog({
        caseId: id,
        actor: req.user.username,
        action: "COPY_REQUEST_CREATED",
        notes: req.body.notes || "",
        details: {
          requestId: created.id,
          requesterName: created.requesterName,
          requesterRelation: created.requesterRelation,
        },
      });
      res.status(201).json(created);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi tạo yêu cầu cấp bản sao");
    }
  }
);

app.post(
  "/copy-requests/:id/approve",
  authenticateToken,
  checkPermission("approve_case"),
  validateRequest([body("notes").optional().isString().isLength({ max: 2000 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const reqItem = await prisma.copyIssuanceRequest.findUnique({ where: { id } });
      if (!reqItem) return res.status(404).send("Yêu cầu không tồn tại");
      if (reqItem.status !== "PENDING") {
        return res.status(400).send("Yêu cầu không ở trạng thái chờ duyệt");
      }
      const updated = await prisma.copyIssuanceRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          decidedBy: req.user.username,
          decidedAt: new Date(),
          notes: req.body.notes || reqItem.notes,
        },
      });
      await createCaseLegalAuditLog({
        caseId: reqItem.caseId,
        actor: req.user.username,
        action: "COPY_REQUEST_APPROVED",
        notes: req.body.notes || "",
        details: { requestId: id },
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi duyệt yêu cầu");
    }
  }
);

app.post(
  "/copy-requests/:id/reject",
  authenticateToken,
  checkPermission("approve_case"),
  validateRequest([
    body("rejectionReason").isString().trim().isLength({ min: 2, max: 2000 }),
  ]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const reqItem = await prisma.copyIssuanceRequest.findUnique({ where: { id } });
      if (!reqItem) return res.status(404).send("Yêu cầu không tồn tại");
      if (reqItem.status !== "PENDING") {
        return res.status(400).send("Yêu cầu không ở trạng thái chờ duyệt");
      }
      const updated = await prisma.copyIssuanceRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          decidedBy: req.user.username,
          decidedAt: new Date(),
          rejectionReason: req.body.rejectionReason,
        },
      });
      await createCaseLegalAuditLog({
        caseId: reqItem.caseId,
        actor: req.user.username,
        action: "COPY_REQUEST_REJECTED",
        notes: req.body.rejectionReason,
        details: { requestId: id },
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi từ chối yêu cầu");
    }
  }
);

app.post(
  "/copy-requests/:id/issue",
  authenticateToken,
  checkPermission("approve_case"),
  validateRequest([body("notes").optional().isString().isLength({ max: 2000 })]),
  async (req, res) => {
    const id = Number(req.params.id);
    try {
      const reqItem = await prisma.copyIssuanceRequest.findUnique({ where: { id } });
      if (!reqItem) return res.status(404).send("Yêu cầu không tồn tại");
      if (reqItem.status !== "APPROVED") {
        return res.status(400).send("Yêu cầu chưa được duyệt");
      }
      const updated = await prisma.copyIssuanceRequest.update({
        where: { id },
        data: {
          status: "ISSUED",
          issuedAt: new Date(),
          notes: req.body.notes || reqItem.notes,
        },
      });
      await createCaseLegalAuditLog({
        caseId: reqItem.caseId,
        actor: req.user.username,
        action: "COPY_REQUEST_ISSUED",
        notes: req.body.notes || "",
        details: { requestId: id, issuedAt: updated.issuedAt.toISOString() },
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi khi cấp bản sao");
    }
  }
);

// ================== START SERVER ==================
const SERVER_PORT = Number(process.env.PORT) || 4000;
const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";

function listLanIPv4Addresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      const fam = net.family;
      const isV4 = fam === "IPv4" || fam === 4;
      if (isV4 && !net.internal) out.push(net.address);
    }
  }
  return out;
}

httpServer.listen(SERVER_PORT, LISTEN_HOST, () => {
  console.log(`Backend listening on http://${LISTEN_HOST === "0.0.0.0" ? "0.0.0.0 (all IPv4 interfaces)" : LISTEN_HOST}:${SERVER_PORT}`);
  console.log(`  Local:   http://localhost:${SERVER_PORT}`);
  const lan = listLanIPv4Addresses();
  if (lan.length) {
    for (const ip of lan) {
      console.log(`  Network: http://${ip}:${SERVER_PORT}`);
    }
  } else {
    console.log("  Network: (no non-loopback IPv4 found — check adapters / VPN)");
  }
});

setInterval(runOverdueNotificationJob, 60 * 1000);
