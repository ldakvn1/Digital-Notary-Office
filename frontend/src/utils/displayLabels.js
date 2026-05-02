export function getStatusLabel(status, t) {
  const statusMap = {
    RECEIVED: t("status.RECEIVED"),
    RECEIPT: t("status.RECEIPT"),
    LEGAL_CHECKING: t("status.LEGAL_CHECKING"),
    DRAFTING: t("status.DRAFTING"),
    REVIEWING: t("status.REVIEWING"),
    APPROVED: t("status.APPROVED"),
    NOTARIZED: t("status.NOTARIZED"),
    DEBT: t("status.DEBT"),
    ARCHIVED: t("status.ARCHIVED"),
    CANCELLED: t("status.CANCELLED"),
  };
  return statusMap[status] || status;
}

export function getCaseTypeLabel(type, t) {
  const typeMap = {
    CONTRACT: t("caseType.contract"),
    AUTHORIZATION: t("caseType.authorization"),
    AUTH_CONTRACT: t("authorizationKind.contract"),
    AUTH_LETTER: t("authorizationKind.letter"),
    INHERITANCE: t("caseType.inheritance"),
    WILL: t("caseType.will"),
    CERTIFICATION: t("caseType.certification"),
    OTHER: t("caseType.other"),
    "Mua bán": t("caseType.contract"),
    "Sale/Purchase": t("caseType.contract"),
    "Ủy quyền": t("caseType.authorization"),
    Authorization: t("caseType.authorization"),
    "Thừa kế": t("caseType.inheritance"),
    Inheritance: t("caseType.inheritance"),
    "Di chúc": t("caseType.will"),
    "Last will": t("caseType.will"),
    "Chứng thực": t("caseType.certification"),
    "Certification (ND23)": t("caseType.certification"),
    "Khác": t("caseType.other"),
    Other: t("caseType.other"),
  };
  return typeMap[type] || type;
}

export function getAuditActionLabel(action, language) {
  if (language !== "vi") return action;
  const actionMapVi = {
    CREATED: "Tạo hồ sơ",
    CASE_CREATED: "Tạo hồ sơ",
    CASE_DETAIL_VIEWED: "Xem chi tiết hồ sơ",
    STATUS_CHANGED: "Chuyển trạng thái",
    FILE_UPLOADED: "Tải lên tài liệu",
    FILE_DELETED: "Xóa tài liệu",
    CASE_ASSIGNED: "Phân công hồ sơ",
    DEADLINE_UPDATED: "Cập nhật hạn chót",
    FEE_UPDATED: "Cập nhật phí",
    CASE_SIGNED: "Ký duyệt hồ sơ",
    CASE_SEALED: "Đóng dấu hồ sơ",
    DOCUMENT_RELEASED: "Phát hành văn bản",
    CASE_SOFT_DELETED: "Hủy/Xóa mềm hồ sơ",
    CASE_RESTORED: "Khôi phục hồ sơ",
    INHERITANCE_POSTING_STARTED: "Bắt đầu niêm yết thừa kế",
    INHERITANCE_POSTING_FINALIZED: "Chốt kết quả niêm yết thừa kế",
    ASSIGNED: "Phân công hồ sơ",
    ASSIGNED_BATCH: "Phân công hàng loạt",
    DEADLINE_SET: "Đặt hạn xử lý",
    PUBLIC_TRACKING_ENABLED: "Bật tra cứu công khai",
    RECEIPT_CREATED: "Tạo phiếu thu",
    RECEIPT_UPDATED: "Cập nhật phiếu thu",
    RECEIPT_DELETED: "Xóa phiếu thu",
    DOCUMENT_GENERATED: "Sinh văn bản tự động",
    SIGNED: "Ký duyệt hồ sơ",
    SEALED: "Đóng dấu hồ sơ",
    RELEASED: "Phát hành PDF chính thức",
    SIGNED_PDF_UPLOADED: "Tải lên PDF đã ký số",
    ISSUED: "Phát hành số công chứng",
    UNLOCKED: "Mở khóa hồ sơ",
  };
  return actionMapVi[action] || action;
}
