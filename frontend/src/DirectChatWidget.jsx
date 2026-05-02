import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "./apiBase";
import axios from "axios";
import {
  Autocomplete,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Portal,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ReplyIcon from "@mui/icons-material/Reply";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import PushPinIcon from "@mui/icons-material/PushPin";
import SettingsIcon from "@mui/icons-material/Settings";
import MicIcon from "@mui/icons-material/Mic";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SmartDisplayOutlinedIcon from "@mui/icons-material/SmartDisplayOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import DoneIcon from "@mui/icons-material/Done";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { io } from "socket.io-client";
import { useI18n } from "./i18n";

const POLL_MS = 30000;
const DEFAULT_MAX_VOICE_RECORDING_SECONDS = 90;
const RAW_MAX_VOICE_SECONDS = Number(import.meta?.env?.VITE_CHAT_MAX_VOICE_RECORDING_SECONDS || DEFAULT_MAX_VOICE_RECORDING_SECONDS);
const MAX_VOICE_RECORDING_SECONDS = Number.isFinite(RAW_MAX_VOICE_SECONDS)
  ? Math.max(10, Math.min(1800, Math.floor(RAW_MAX_VOICE_SECONDS)))
  : DEFAULT_MAX_VOICE_RECORDING_SECONDS;
const QUICK_EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤩",
  "🥳", "🤔", "😴", "😭", "😡", "👍", "👏", "🙏", "💪", "🎉",
  "🔥", "✨", "❤️", "💙", "💚", "💛", "💜", "💯", "✅", "🚀",
];
const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "👏"];
const CHAT_STATUS_VALUES = ["AVAILABLE", "BUSY", "AWAY", "DND", "INVISIBLE"];
const MESSAGE_SEARCH_TOP_N = 6;
const normalizeStatus = (value) => {
  const next = String(value || "").trim().toUpperCase();
  return CHAT_STATUS_VALUES.includes(next) ? next : "AVAILABLE";
};

export default function DirectChatWidget({ currentUser, toastApi }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [chatMode, setChatMode] = useState("direct");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupMemberUsernames, setGroupMemberUsernames] = useState([]);
  const [groupShowFullDirectory, setGroupShowFullDirectory] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupRenameDraft, setGroupRenameDraft] = useState("");
  const [groupAddMemberSelections, setGroupAddMemberSelections] = useState([]);
  const [groupAddMemberQuery, setGroupAddMemberQuery] = useState("");
  const [groupMembersQuery, setGroupMembersQuery] = useState("");
  const [groupManaging, setGroupManaging] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [quoteDraftPrefix, setQuoteDraftPrefix] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [searchScope, setSearchScope] = useState("all");
  const [searchNavIndex, setSearchNavIndex] = useState(-1);
  const [directMessageSearchByUser, setDirectMessageSearchByUser] = useState({});
  const [peerTyping, setPeerTyping] = useState(false);
  const [emojiAnchorEl, setEmojiAnchorEl] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [mentionAnchorEl, setMentionAnchorEl] = useState(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionRange, setMentionRange] = useState(null);
  const [pinnedGroupIds, setPinnedGroupIds] = useState([]);
  const [groupMentionOnly, setGroupMentionOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mutedDirectUsernames, setMutedDirectUsernames] = useState([]);
  const [mutedGroupIds, setMutedGroupIds] = useState([]);
  const [groupMessageSearch, setGroupMessageSearch] = useState("");
  const [groupSearchIndex, setGroupSearchIndex] = useState(0);
  const [conversationMenuAnchorEl, setConversationMenuAnchorEl] = useState(null);
  const [conversationMenuTarget, setConversationMenuTarget] = useState(null);
  const [statusMenuAnchorEl, setStatusMenuAnchorEl] = useState(null);
  const [myChatStatus, setMyChatStatus] = useState(() => normalizeStatus(localStorage.getItem("chatMyStatus")));
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({
    open: false,
    type: "",
    username: "",
    groupId: null,
    name: "",
  });
  const [mediaPreview, setMediaPreview] = useState({
    open: false,
    type: "",
    src: "",
    name: "",
    message: null,
    mode: "direct",
    groupId: null,
  });
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingVoiceSeconds, setRecordingVoiceSeconds] = useState(0);
  const [pendingVoiceFile, setPendingVoiceFile] = useState(null);
  const [pendingVoiceUrl, setPendingVoiceUrl] = useState("");
  const [pendingPastedImageFile, setPendingPastedImageFile] = useState(null);
  const [pendingPastedImageUrl, setPendingPastedImageUrl] = useState("");
  const [pendingPastedImageCaption, setPendingPastedImageCaption] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const typingStopTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const readSyncTimerRef = useRef(null);
  const lastRateLimitToastAtRef = useRef(0);
  const latestMessageIdByUserRef = useRef({});
  const messageListRef = useRef(null);
  const socketRef = useRef(null);
  const selectedUsernameRef = useRef("");
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const composerInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceRecordTimerRef = useRef(null);
  const voiceAutoStopTimerRef = useRef(null);

  const selectedUser = useMemo(() => {
    const merged = [...users, ...directoryUsers];
    const seen = new Set();
    for (const item of merged) {
      if (!item?.username || seen.has(item.username)) continue;
      seen.add(item.username);
      if (item.username === selectedUsername) return item;
    }
    return null;
  }, [users, directoryUsers, selectedUsername]);
  const selectedGroup = useMemo(
    () => groups.find((item) => Number(item.id) === Number(selectedGroupId)) || null,
    [groups, selectedGroupId]
  );
  const canManageSelectedGroup = useMemo(() => {
    if (!selectedGroup || !currentUser?.username) return false;
    const owner = (selectedGroup.members || []).find((member) => Number(member.id) === Number(selectedGroup.ownerId));
    if (String(owner?.username || "") === String(currentUser.username || "")) return true;
    const selfMember = (selectedGroup.members || []).find((member) => member.username === currentUser.username);
    return Boolean(selfMember?.isAdmin);
  }, [selectedGroup, currentUser?.username]);
  const canTransferSelectedGroupOwner = useMemo(() => {
    if (!selectedGroup || !currentUser?.username) return false;
    const owner = (selectedGroup.members || []).find((member) => Number(member.id) === Number(selectedGroup.ownerId));
    return String(owner?.username || "") === String(currentUser.username || "");
  }, [selectedGroup, currentUser?.username]);
  const canDeleteSelectedGroup = useMemo(() => {
    if (!selectedGroup || !currentUser?.username) return false;
    const owner = (selectedGroup.members || []).find((member) => Number(member.id) === Number(selectedGroup.ownerId));
    return String(owner?.username || "") === String(currentUser.username || "");
  }, [selectedGroup, currentUser?.username]);
  const activeMessages = chatMode === "group" ? groupMessages : messages;
  const activeCanSend = chatMode === "group" ? Boolean(selectedGroupId) : Boolean(selectedUsername);
  const totalUnreadCount = useMemo(
    () =>
      users.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0) +
      groups.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    [users, groups]
  );
  const filteredUsers = useMemo(() => {
    const q = String(userSearch || "").toLowerCase().trim();
    if (!q) return users;
    const merged = new Map();
    for (const item of users) {
      if (!item?.username) continue;
      merged.set(item.username, item);
    }
    for (const item of directoryUsers) {
      if (!item?.username) continue;
      if (!merged.has(item.username)) {
        merged.set(item.username, item);
      }
    }
    const searched = [...merged.values()].filter((item) => {
      const peopleFields = [item.fullName, item.username].filter(Boolean);
      const matchedSnippet = directMessageSearchByUser[String(item.username || "")]?.snippet || "";
      const messageFields = [matchedSnippet, item.lastMessageText].filter(Boolean);
      const targets =
        searchScope === "people"
          ? peopleFields
          : searchScope === "messages"
            ? messageFields
            : [...peopleFields, ...messageFields];
      return targets.some((value) => String(value).toLowerCase().includes(q));
    });
    return unreadOnly ? searched.filter((item) => Number(item.unreadCount || 0) > 0) : searched;
  }, [users, directoryUsers, userSearch, searchScope, unreadOnly, directMessageSearchByUser]);
  const filteredGroups = useMemo(() => {
    const q = String(userSearch || "").toLowerCase().trim();
    const searched = !q
      ? groups
      : groups.filter((item) =>
          (() => {
            const peopleFields = [item.name, ...(item.members || []).map((m) => m.fullName || m.username)].filter(Boolean);
            const messageFields = [item.lastMessageText].filter(Boolean);
            const targets =
              searchScope === "people"
                ? peopleFields
                : searchScope === "messages"
                  ? messageFields
                  : [...peopleFields, ...messageFields];
            return targets.some((value) => String(value).toLowerCase().includes(q));
          })()
        );
    const byMention = groupMentionOnly ? searched.filter((item) => Number(item.mentionUnreadCount || 0) > 0) : searched;
    const byUnread = unreadOnly ? byMention.filter((item) => Number(item.unreadCount || 0) > 0) : byMention;
    return [...byUnread].sort((a, b) => {
      const aPinned = pinnedGroupIds.includes(Number(a.id)) ? 1 : 0;
      const bPinned = pinnedGroupIds.includes(Number(b.id)) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [groups, userSearch, groupMentionOnly, unreadOnly, pinnedGroupIds, searchScope]);
  const selectableUsers = useMemo(() => {
    const merged = [...directoryUsers, ...users];
    const map = new Map();
    for (const item of merged) {
      const username = String(item?.username || "").trim();
      if (!username || username === currentUser?.username || map.has(username)) continue;
      map.set(username, item);
    }
    return [...map.values()].sort((a, b) =>
      String(a.fullName || a.username).localeCompare(String(b.fullName || b.username), "vi", { sensitivity: "base" })
    );
  }, [directoryUsers, users, currentUser?.username]);
  const filteredSelectableUsers = useMemo(() => {
    const q = String(groupMemberSearch || "").toLowerCase().trim();
    if (!q) return selectableUsers;
    return selectableUsers.filter((item) =>
      [item.fullName, item.username]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [selectableUsers, groupMemberSearch]);
  const visibleGroupCandidates = useMemo(() => {
    const q = String(groupMemberSearch || "").toLowerCase().trim();
    if (q) return filteredSelectableUsers.slice(0, 24);
    if (groupShowFullDirectory) return selectableUsers.slice(0, 30);
    const onlineSuggested = selectableUsers.filter((item) => item.online);
    return onlineSuggested.slice(0, 10);
  }, [groupMemberSearch, filteredSelectableUsers, selectableUsers, groupShowFullDirectory]);
  const existingGroupMemberUsernames = useMemo(
    () => new Set((selectedGroup?.members || []).map((item) => String(item.username || "").toLowerCase())),
    [selectedGroup]
  );
  const groupAddMemberOptions = useMemo(() => {
    return [...selectableUsers].sort((a, b) => {
      const aExisting = existingGroupMemberUsernames.has(String(a.username || "").toLowerCase()) ? 1 : 0;
      const bExisting = existingGroupMemberUsernames.has(String(b.username || "").toLowerCase()) ? 1 : 0;
      if (aExisting !== bExisting) return aExisting - bExisting;
      return String(a.fullName || a.username).localeCompare(String(b.fullName || b.username), "vi", {
        sensitivity: "base",
      });
    });
  }, [selectableUsers, existingGroupMemberUsernames]);
  const visibleGroupMembers = useMemo(() => {
    const q = String(groupMembersQuery || "").toLowerCase().trim();
    const rank = (member) => {
      if (Number(member.id) === Number(selectedGroup?.ownerId)) return 0;
      if (member.isAdmin) return 1;
      return 2;
    };
    return [...(selectedGroup?.members || [])]
      .filter((member) => {
        if (!q) return true;
        return [member.fullName, member.username]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const byRole = rank(a) - rank(b);
        if (byRole !== 0) return byRole;
        return String(a.fullName || a.username).localeCompare(String(b.fullName || b.username), "vi", {
          sensitivity: "base",
        });
      });
  }, [groupMembersQuery, selectedGroup]);
  const mentionCandidates = useMemo(() => {
    if (chatMode !== "group" || !selectedGroup) return [];
    const query = String(mentionQuery || "").toLowerCase().trim();
    const pool = (selectedGroup.members || []).filter((item) => item.username !== currentUser?.username);
    if (!query) return pool.slice(0, 8);
    return pool
      .filter((item) =>
        [item.fullName, item.username]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [chatMode, mentionQuery, selectedGroup, currentUser?.username]);
  const filteredGroupMessages = useMemo(() => {
    if (chatMode !== "group") return activeMessages;
    const q = String(groupMessageSearch || "").toLowerCase().trim();
    if (!q) return activeMessages;
    return activeMessages.filter((message) => {
      const text = String(message.content || "").toLowerCase();
      const sender = String(message.senderFullName || message.senderUsername || "").toLowerCase();
      return text.includes(q) || sender.includes(q);
    });
  }, [chatMode, activeMessages, groupMessageSearch]);
  const activeRenderedMessages = chatMode === "group" ? filteredGroupMessages : activeMessages;
  const normalizedSearchQuery = useMemo(() => String(userSearch || "").trim(), [userSearch]);
  const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const renderHighlightedText = (text = "", query = "") => {
    const source = String(text || "");
    const q = String(query || "").trim();
    if (!source || !q) return source;
    const regex = new RegExp(`(${escapeRegExp(q)})`, "ig");
    const parts = source.split(regex);
    return parts.map((part, idx) => {
      if (!part) return null;
      const matched = part.toLowerCase() === q.toLowerCase();
      return matched ? (
        <Box
          key={`hl-${idx}`}
          component="mark"
          sx={{
            px: 0.2,
            borderRadius: 0.5,
            bgcolor: "rgba(250,204,21,0.35)",
            color: "inherit",
          }}
        >
          {part}
        </Box>
      ) : (
        <span key={`txt-${idx}`}>{part}</span>
      );
    });
  };
  const getSearchSnippet = (text = "", query = "", maxLen = 68) => {
    const source = String(text || "");
    const q = String(query || "").trim().toLowerCase();
    if (!source || !q) return "";
    const at = source.toLowerCase().indexOf(q);
    if (at < 0) return "";
    const start = Math.max(0, at - Math.floor((maxLen - q.length) / 2));
    const end = Math.min(source.length, start + maxLen);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < source.length ? "..." : "";
    return `${prefix}${source.slice(start, end)}${suffix}`;
  };
  const getSearchRelevanceScore = (snippet = "", query = "", unreadCount = 0, lastMessageAt = null) => {
    const source = String(snippet || "").toLowerCase();
    const q = String(query || "").trim().toLowerCase();
    if (!source || !q) return 0;
    const exactCount = (source.match(new RegExp(escapeRegExp(q), "g")) || []).length;
    const startsWith = source.startsWith(q) ? 2 : 0;
    const unreadBoost = Number(unreadCount || 0) > 0 ? 1 : 0;
    const recencyBoost = lastMessageAt ? Math.min(2, Math.max(0, (Date.now() - new Date(lastMessageAt).getTime()) / 3600000 < 24 ? 1.5 : 0.5)) : 0;
    return exactCount * 3 + startsWith + unreadBoost + recencyBoost;
  };
  const directMessageMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return filteredUsers
      .map((item) => {
        const raw = directMessageSearchByUser[String(item.username || "")]?.snippet || item.lastMessageText || "";
        const snippet = getSearchSnippet(raw, normalizedSearchQuery);
        if (!snippet) return null;
        const score = getSearchRelevanceScore(
          snippet,
          normalizedSearchQuery,
          Number(item.unreadCount || 0),
          item.lastMessageAt
        );
        return { ...item, snippet, score };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, MESSAGE_SEARCH_TOP_N);
  }, [filteredUsers, directMessageSearchByUser, normalizedSearchQuery]);
  const groupMessageMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return filteredGroups
      .map((item) => {
        const snippet = getSearchSnippet(item.lastMessageText || "", normalizedSearchQuery);
        if (!snippet) return null;
        const score = getSearchRelevanceScore(
          snippet,
          normalizedSearchQuery,
          Number(item.unreadCount || 0),
          item.lastMessageAt
        );
        return { ...item, snippet, score };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, MESSAGE_SEARCH_TOP_N);
  }, [filteredGroups, normalizedSearchQuery]);
  const getStatusLabel = (statusRaw, online = true) => {
    const status = String(statusRaw || "AVAILABLE").toUpperCase();
    if (!online && status !== "INVISIBLE") return t("chatWidget.statusOffline");
    if (status === "BUSY") return t("chatWidget.statusBusy");
    if (status === "AWAY") return t("chatWidget.statusAway");
    if (status === "DND") return t("chatWidget.statusDnd");
    if (status === "INVISIBLE") return t("chatWidget.statusInvisible");
    return t("chatWidget.statusOnline");
  };
  const getStatusColor = (statusRaw, online = true) => {
    const status = String(statusRaw || "AVAILABLE").toUpperCase();
    if (!online || status === "INVISIBLE") return "default";
    if (status === "BUSY") return "error";
    if (status === "AWAY") return "warning";
    if (status === "DND") return "secondary";
    return "success";
  };
  const renderDeliveryStateIcon = (message, isLatestMine = false) => {
    if (!message?.isMine || !isLatestMine) return null;
    if (message.readAt) {
      return <DoneAllIcon sx={{ fontSize: 14, color: "#60a5fa" }} titleAccess={t("chatWidget.read")} />;
    }
    if (message.deliveredAt) {
      return <DoneAllIcon sx={{ fontSize: 14, color: "text.secondary" }} titleAccess={t("chatWidget.delivered")} />;
    }
    return <DoneIcon sx={{ fontSize: 13, color: "text.secondary" }} titleAccess={t("chatWidget.sent")} />;
  };
  const renderDeletedMessageNotice = (message) => (
    <Stack
      direction="row"
      spacing={0.6}
      alignItems="center"
      sx={{
        width: "fit-content",
        px: 0.8,
        py: 0.4,
        borderRadius: 1.2,
        bgcolor: message?.isMine ? "rgba(255,255,255,0.16)" : "rgba(148,163,184,0.18)",
        border: "1px dashed",
        borderColor: message?.isMine ? "rgba(255,255,255,0.36)" : "rgba(148,163,184,0.42)",
      }}
    >
      <DeleteIcon sx={{ fontSize: 13, opacity: 0.9 }} />
      <Typography variant="caption" sx={{ fontStyle: "italic", opacity: 0.92 }}>
        {t("chatWidget.messageDeleted")}
      </Typography>
    </Stack>
  );
  const searchEntries = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    if (chatMode === "group") {
      return filteredGroups.map((item) => ({
        key: `group:${Number(item.id)}`,
        type: "group",
        groupId: Number(item.id),
      }));
    }
    return filteredUsers.map((item) => ({
      key: `direct:${String(item.username || "")}`,
      type: "direct",
      username: String(item.username || ""),
    }));
  }, [normalizedSearchQuery, chatMode, filteredGroups, filteredUsers]);
  useEffect(() => {
    if (!normalizedSearchQuery || !searchEntries.length) {
      setSearchNavIndex(-1);
      return;
    }
    setSearchNavIndex((prev) => {
      if (prev < 0) return 0;
      return Math.min(prev, searchEntries.length - 1);
    });
  }, [normalizedSearchQuery, searchEntries]);
  const handleSearchKeyDown = (event) => {
    if (!normalizedSearchQuery || !searchEntries.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchNavIndex((prev) => (prev + 1 + searchEntries.length) % searchEntries.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchNavIndex((prev) => (prev - 1 + searchEntries.length) % searchEntries.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = searchEntries[searchNavIndex >= 0 ? searchNavIndex : 0];
      if (!picked) return;
      if (picked.type === "group" && picked.groupId) {
        setSelectedGroupId(Number(picked.groupId));
      }
      if (picked.type === "direct" && picked.username) {
        setSelectedUsername(String(picked.username));
      }
    }
  };
  useEffect(() => {
    if (!mentionCandidates.length) {
      setMentionActiveIndex(0);
      return;
    }
    if (mentionActiveIndex >= mentionCandidates.length) {
      setMentionActiveIndex(0);
    }
  }, [mentionCandidates, mentionActiveIndex]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chatWidgetPinnedGroups");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPinnedGroupIds(parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item)));
      }
    } catch (_error) {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("chatWidgetPinnedGroups", JSON.stringify(pinnedGroupIds));
    } catch (_error) {}
  }, [pinnedGroupIds]);
  useEffect(() => {
    try {
      localStorage.setItem("chatMyStatus", String(myChatStatus || "AVAILABLE"));
    } catch (_error) {}
  }, [myChatStatus]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chatWidgetMutedDirect");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMutedDirectUsernames(parsed.map((item) => String(item || "").trim()).filter(Boolean));
      }
    } catch (_error) {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("chatWidgetMutedDirect", JSON.stringify(mutedDirectUsernames));
    } catch (_error) {}
  }, [mutedDirectUsernames]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chatWidgetMutedGroups");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMutedGroupIds(parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item)));
      }
    } catch (_error) {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("chatWidgetMutedGroups", JSON.stringify(mutedGroupIds));
    } catch (_error) {}
  }, [mutedGroupIds]);
  const unlockAudioIfNeeded = () => {
    try {
      if (typeof window === "undefined") return null;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    } catch (_error) {
      return null;
    }
  };
  useEffect(() => {
    const primeAudio = () => {
      const ctx = unlockAudioIfNeeded();
      if (!ctx) return;
      // Prime a near-silent tone so subsequent notifications can play immediately.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.00001, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    };
    window.addEventListener("pointerdown", primeAudio, { once: true });
    window.addEventListener("keydown", primeAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, []);
  const playTone = (ctx, { frequency = 880, type = "sine", startOffset = 0, duration = 0.08, volume = 0.06 }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const startAt = ctx.currentTime + startOffset;
    const endAt = startAt + duration;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.start(startAt);
    osc.stop(endAt);
  };
  const playIncomingSound = () => {
    try {
      const ctx = unlockAudioIfNeeded();
      if (!ctx) return;
      // Modern two-note "ping" for new message.
      playTone(ctx, { frequency: 880, type: "triangle", startOffset: 0, duration: 0.07, volume: 0.05 });
      playTone(ctx, { frequency: 1240, type: "triangle", startOffset: 0.09, duration: 0.09, volume: 0.055 });
    } catch (_error) {
      // Ignore audio errors (browser policy/device constraints).
    }
  };
  const playMentionSound = () => {
    try {
      const ctx = unlockAudioIfNeeded();
      if (!ctx) return;
      // Slightly brighter 3-tone chime for mentions.
      playTone(ctx, { frequency: 1320, type: "sine", startOffset: 0, duration: 0.06, volume: 0.065 });
      playTone(ctx, { frequency: 1660, type: "sine", startOffset: 0.07, duration: 0.08, volume: 0.07 });
      playTone(ctx, { frequency: 1980, type: "sine", startOffset: 0.16, duration: 0.09, volume: 0.06 });
    } catch (_error) {
      // Ignore audio errors (browser policy/device constraints).
    }
  };

  const loadUsers = async () => {
    try {
      const res = await axios.get(API_BASE + "/chat/conversations");
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(list);
      if (!selectedUsername && list.length > 0) {
        setSelectedUsername(list[0].username);
      }
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      // Avoid noisy popups on refresh/reconnect; only show infrequent warning.
      if (status === 429 && open) {
        const now = Date.now();
        if (now - lastRateLimitToastAtRef.current > 60000) {
          lastRateLimitToastAtRef.current = now;
          toastApi?.warning(t("chatWidget.rateLimited"));
        }
      }
    }
  };
  const loadDirectoryUsers = async () => {
    try {
      const res = await axios.get(API_BASE + "/chat/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setDirectoryUsers(
        list.map((item) => ({
          ...item,
          lastMessageText: item.lastMessageText || "",
          lastMessageAt: item.lastMessageAt || null,
        }))
      );
    } catch (error) {
      console.error(error);
    }
  };
  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await axios.get(API_BASE + "/chat/groups");
      const list = Array.isArray(res.data) ? res.data : [];
      setGroups(list);
      if (!selectedGroupId && list.length > 0) {
        setSelectedGroupId(Number(list[0].id));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadGroupMessages = async (groupId, silent = false) => {
    if (!groupId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await axios.get(`${API_BASE}/chat/groups/${Number(groupId)}/messages`, {
        params: { limit: 120 },
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setGroupMessages(list);
    } catch (error) {
      if (!silent) toastApi?.error(t("chatWidget.loadConversationError"));
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  const loadConversation = async (username, silent = false) => {
    if (!username) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await axios.get(`${API_BASE}/chat/direct/${encodeURIComponent(username)}`, {
        params: { limit: 100 },
      });
      const nextMessages = Array.isArray(res.data) ? res.data : [];
      setHasMore(nextMessages.length >= 100);
      const lastId = nextMessages.length > 0 ? Number(nextMessages[nextMessages.length - 1].id || 0) : 0;
      const prevLastId = Number(latestMessageIdByUserRef.current[username] || 0);
      if (silent && prevLastId > 0 && lastId > prevLastId) {
        const hasIncoming = nextMessages.some((item) => !item.isMine && Number(item.id) > prevLastId);
        if (hasIncoming) playIncomingSound();
      }
      latestMessageIdByUserRef.current[username] = lastId;
      setMessages(nextMessages);
    } catch (error) {
      if (!silent) {
        console.error(error);
        toastApi?.error(t("chatWidget.loadConversationError"));
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!selectedUsername || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const firstId = Number(messages[0]?.id || 0);
      const res = await axios.get(`${API_BASE}/chat/direct/${encodeURIComponent(selectedUsername)}`, {
        params: { limit: 50, beforeId: firstId },
      });
      const older = Array.isArray(res.data) ? res.data : [];
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length >= 50);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    selectedUsernameRef.current = selectedUsername;
  }, [selectedUsername]);

  useEffect(() => {
    if (!currentUser?.username) return;
    axios.post(API_BASE + "/chat/presence").catch(() => {});
    const safeStatus = normalizeStatus(myChatStatus);
    if (safeStatus) {
      axios.patch(API_BASE + "/chat/presence/status", { status: safeStatus }).catch(() => {});
    }
    loadUsers();
    loadGroups();
    const timer = setInterval(() => {
      axios.post(API_BASE + "/chat/presence").catch(() => {});
      loadUsers();
      loadGroups();
      if (open && chatMode === "direct" && selectedUsername) {
        loadConversation(selectedUsername, true);
      }
      if (open && chatMode === "group" && selectedGroupId) {
        loadGroupMessages(selectedGroupId, true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [currentUser?.username, open, selectedUsername, selectedGroupId, chatMode, myChatStatus]);
  useEffect(() => {
    if (!open) return;
    const q = String(userSearch || "").trim();
    if (!q) return;
    const timer = setTimeout(() => {
      loadDirectoryUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [open, userSearch]);
  useEffect(() => {
    const q = String(normalizedSearchQuery || "").trim();
    if (!q) {
      setDirectMessageSearchByUser({});
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      axios
        .get(API_BASE + "/chat/search/direct", {
          params: { q, limit: 80 },
        })
        .then((res) => {
          if (cancelled) return;
          const list = Array.isArray(res?.data) ? res.data : [];
          const next = {};
          for (const item of list) {
            const username = String(item?.username || "").trim();
            if (!username) continue;
            next[username] = {
              snippet: String(item?.snippet || ""),
              fullName: String(item?.fullName || username),
            };
          }
          setDirectMessageSearchByUser(next);
        })
        .catch(() => {
          if (!cancelled) setDirectMessageSearchByUser({});
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedSearchQuery]);

  useEffect(() => {
    if (!currentUser?.username) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const socket = io(API_BASE, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("chat:presence:ping");
    });
    socket.on("disconnect", () => {
      setSocketConnected(false);
    });
    socket.on("chat:presence", ({ username, online, status }) => {
      if (!username) return;
      setUsers((prev) =>
        prev.map((item) =>
          item.username === username
            ? { ...item, online: Boolean(online), status: String(status || item.status || "AVAILABLE") }
            : item
        )
      );
    });
    socket.on("chat:typing", ({ fromUsername, typing }) => {
      if (String(fromUsername || "") === String(selectedUsernameRef.current || "")) {
        setPeerTyping(Boolean(typing));
      }
    });
    socket.on("chat:message", (payload) => {
      if (!payload) return;
      const targetUsername = payload.isMine ? payload.receiverUsername : payload.senderUsername;
      const isMutedDirect = mutedDirectUsernames.includes(String(targetUsername || ""));
      if (!payload.isMine && !isMutedDirect) {
        playIncomingSound();
      }
      setUsers((prev) =>
        prev.map((item) =>
          item.username === targetUsername
            ? {
                ...item,
                lastMessageText: payload.attachmentName
                  ? `[${t("chatWidget.attachmentLabel")}] ${payload.attachmentName}`
                  : payload.content || "",
                lastMessageAt: payload.createdAt || null,
                unreadCount:
                  payload.isMine || item.username === selectedUsernameRef.current
                    ? item.unreadCount || 0
                    : Number(item.unreadCount || 0) + 1,
              }
            : item
        )
      );
      const relatedToSelected =
        String(selectedUsernameRef.current || "") &&
        (String(payload.senderUsername || "") === String(selectedUsernameRef.current) ||
          String(payload.receiverUsername || "") === String(selectedUsernameRef.current));
      if (relatedToSelected) {
        setMessages((prev) => {
          if (prev.some((item) => Number(item.id) === Number(payload.id))) return prev;
          return [...prev, payload];
        });
      }
    });
    socket.on("chat:group-updated", () => {
      loadGroups();
    });
    socket.on("chat:group-message", (payload) => {
      if (!payload?.id || !payload?.groupId) return;
      setGroups((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(payload.groupId)
            ? {
                ...item,
                lastMessageText: payload.attachmentName
                  ? `[${t("chatWidget.attachmentLabel")}] ${payload.attachmentName}`
                  : payload.content || "",
                lastMessageAt: payload.createdAt || item.lastMessageAt,
                unreadCount:
                  payload.isMine || Number(selectedGroupId || 0) === Number(payload.groupId)
                    ? Number(item.unreadCount || 0)
                    : Number(item.unreadCount || 0) + 1,
                mentionUnreadCount:
                  payload.isMine || Number(selectedGroupId || 0) === Number(payload.groupId)
                    ? Number(item.mentionUnreadCount || 0)
                    : payload.mentionMe
                      ? Number(item.mentionUnreadCount || 0) + 1
                      : Number(item.mentionUnreadCount || 0),
              }
            : item
        )
      );
      if (Number(selectedGroupId || 0) === Number(payload.groupId)) {
        setGroupMessages((prev) => {
          if (prev.some((item) => Number(item.id) === Number(payload.id))) return prev;
          return [...prev, payload];
        });
      } else if (!payload.isMine) {
        const isMutedGroup = mutedGroupIds.includes(Number(payload.groupId));
        if (isMutedGroup) return;
        if (payload.mentionMe) {
          playMentionSound();
          toastApi?.info(`@${currentUser?.username} được nhắc tới trong nhóm`);
        } else {
          playIncomingSound();
        }
      }
    });
    socket.on("chat:group-read", ({ groupId }) => {
      setGroups((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(groupId) ? { ...item, unreadCount: 0, mentionUnreadCount: 0 } : item
        )
      );
    });
    socket.on("chat:message-updated", (payload) => {
      if (!payload?.id) return;
      setMessages((prev) =>
        prev.map((item) => (Number(item.id) === Number(payload.id) ? { ...item, ...payload } : item))
      );
      setUsers((prev) =>
        prev.map((item) =>
          item.username === selectedUsernameRef.current
            ? {
                ...item,
                lastMessageText: payload.isDeleted
                  ? t("chatWidget.messageDeleted")
                  : payload.attachmentName
                    ? `[${t("chatWidget.attachmentLabel")}] ${payload.attachmentName}`
                    : payload.content || item.lastMessageText,
                unreadCount: 0,
              }
            : item
        )
      );
    });
    socket.on("chat:group-message-updated", (payload) => {
      if (!payload?.id) return;
      setGroupMessages((prev) =>
        prev.map((item) => (Number(item.id) === Number(payload.id) ? { ...item, ...payload } : item))
      );
    });
    socket.on("chat:conversation-deleted", ({ username }) => {
      const removedUsername = String(username || "").trim();
      if (!removedUsername) return;
      setUsers((prev) => prev.filter((item) => item.username !== removedUsername));
      if (String(selectedUsernameRef.current || "") === removedUsername) {
        setMessages([]);
        setSelectedUsername("");
      }
    });
    socket.on("chat:read", ({ byUsername }) => {
      if (String(byUsername || "") !== String(selectedUsernameRef.current || "")) return;
      setMessages((prev) =>
        prev.map((item) => (item.isMine && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item))
      );
      setUsers((prev) =>
        prev.map((item) =>
          String(item.username || "") === String(byUsername || "") ? { ...item, unreadCount: 0 } : item
        )
      );
    });
    socket.on("chat:delivered", ({ byUsername }) => {
      if (String(byUsername || "") !== String(selectedUsernameRef.current || "")) return;
      setMessages((prev) =>
        prev.map((item) =>
          item.isMine && !item.readAt && !item.deliveredAt ? { ...item, deliveredAt: new Date().toISOString() } : item
        )
      );
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser?.username, selectedGroupId, toastApi, mutedDirectUsernames, mutedGroupIds]);

  useEffect(() => {
    if (!open || chatMode !== "direct" || !selectedUsername) return;
    loadConversation(selectedUsername);
  }, [open, selectedUsername, chatMode]);

  useEffect(() => {
    if (!open || chatMode !== "group" || !selectedGroupId) return;
    loadGroupMessages(selectedGroupId);
  }, [open, selectedGroupId, chatMode]);
  useEffect(() => {
    return () => {
      try {
        if (voiceRecordTimerRef.current) clearInterval(voiceRecordTimerRef.current);
        if (voiceAutoStopTimerRef.current) clearTimeout(voiceAutoStopTimerRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch (_error) {}
      if (pendingVoiceUrl) {
        window.URL.revokeObjectURL(pendingVoiceUrl);
      }
      if (pendingPastedImageUrl) {
        window.URL.revokeObjectURL(pendingPastedImageUrl);
      }
    };
  }, [pendingVoiceUrl, pendingPastedImageUrl]);

  useEffect(() => {
    if (!open) return;
    if (readSyncTimerRef.current) clearTimeout(readSyncTimerRef.current);
    readSyncTimerRef.current = setTimeout(() => {
      if (chatMode === "group" && selectedGroupId) {
        axios.post(`${API_BASE}/chat/groups/${Number(selectedGroupId)}/read`).catch(() => {});
      } else if (chatMode === "direct" && selectedUsername) {
        axios.post(`${API_BASE}/chat/direct/${encodeURIComponent(selectedUsername)}/read`).catch(() => {});
      }
    }, 700);
    return () => {
      if (readSyncTimerRef.current) clearTimeout(readSyncTimerRef.current);
    };
  }, [open, selectedUsername, selectedGroupId, chatMode, messages.length, groupMessages.length]);

  useEffect(() => {
    if (!open || !selectedUsername || socketConnected) return;
    const loadTyping = () =>
      axios
        .get(`${API_BASE}/chat/direct/${encodeURIComponent(selectedUsername)}/typing`)
        .then((res) => setPeerTyping(Boolean(res?.data?.peerTyping)))
        .catch(() => {});
    loadTyping();
    const timer = setInterval(loadTyping, 5000);
    return () => clearInterval(timer);
  }, [open, selectedUsername, socketConnected]);

  const sendTyping = (typing) => {
    if (!selectedUsername) return;
    socketRef.current?.emit("chat:presence:ping");
    if (typing === typingActiveRef.current) return;
    typingActiveRef.current = typing;
    axios
      .post(`${API_BASE}/chat/direct/${encodeURIComponent(selectedUsername)}/typing`, { typing })
      .catch(() => {});
  };

  useEffect(() => {
    if (!open || loadingMessages) return;
    const el = messageListRef.current;
    if (!el) return;
    const scrollToEnd = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToEnd();
    const raf = requestAnimationFrame(() => {
      scrollToEnd();
      requestAnimationFrame(scrollToEnd);
    });
    const t0 = setTimeout(scrollToEnd, 0);
    const t1 = setTimeout(scrollToEnd, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [
    open,
    loadingMessages,
    chatMode,
    selectedUsername,
    selectedGroupId,
    messages.length,
    groupMessages.length,
  ]);
  useEffect(() => {
    setGroupSearchIndex(0);
  }, [groupMessageSearch, selectedGroupId, chatMode]);

  const handleSend = async () => {
    const content = draft.trim();
    const pastedCaption = pendingPastedImageCaption.trim();
    const outboundContent = content || (pendingPastedImageFile ? pastedCaption : "");
    if ((!outboundContent && !pendingPastedImageFile) || !activeCanSend || sending) return;
    setSending(true);
    try {
      if (pendingPastedImageFile) {
        const nextFile = pendingPastedImageFile;
        const nextCaption = outboundContent;
        if (pendingPastedImageUrl) window.URL.revokeObjectURL(pendingPastedImageUrl);
        setPendingPastedImageFile(null);
        setPendingPastedImageUrl("");
        setPendingPastedImageCaption("");
        await sendAttachmentFile(nextFile, nextCaption);
      } else if (outboundContent) {
        if (chatMode === "group" && selectedGroupId) {
          const res = await axios.post(`${API_BASE}/chat/groups/${Number(selectedGroupId)}/messages`, {
            content: outboundContent,
            ...(replyingTo?.id ? { replyToId: replyingTo.id } : {}),
          });
          setGroupMessages((prev) => {
            if (prev.some((item) => Number(item.id) === Number(res.data?.id))) return prev;
            return [...prev, res.data];
          });
        } else {
          const res =
            editingMessageId !== null
              ? await axios.patch(`${API_BASE}/chat/direct/messages/${editingMessageId}`, { content: outboundContent })
              : await axios.post(`${API_BASE}/chat/direct/${encodeURIComponent(selectedUsername)}`, {
                  content: outboundContent,
                  ...(replyingTo?.id ? { replyToId: replyingTo.id } : {}),
                });
          setMessages((prev) => {
            if (editingMessageId !== null) {
              return prev.map((item) => (Number(item.id) === Number(editingMessageId) ? { ...item, ...res.data } : item));
            }
            if (prev.some((item) => Number(item.id) === Number(res.data?.id))) {
              return prev;
            }
            return [...prev, res.data];
          });
        }
      }
      setDraft("");
      setEditingMessageId(null);
      setReplyingTo(null);
      setQuoteDraftPrefix("");
      sendTyping(false);
      loadUsers();
      loadGroups();
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.sendError"));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const res = await axios.delete(`${API_BASE}/chat/direct/messages/${messageId}`);
      setMessages((prev) =>
        prev.map((item) => (Number(item.id) === Number(messageId) ? { ...item, ...(res.data || {}) } : item))
      );
      loadUsers();
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.deleteError"));
    }
  };
  const handleDeleteGroupMessage = async (groupIdInput, messageId) => {
    const groupId = Number(groupIdInput || 0);
    if (!groupId || !messageId) return;
    try {
      const res = await axios.delete(`${API_BASE}/chat/groups/${groupId}/messages/${Number(messageId)}`);
      setGroupMessages((prev) =>
        prev.map((item) => (Number(item.id) === Number(messageId) ? { ...item, ...(res.data || {}) } : item))
      );
      loadGroups();
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.deleteError"));
    }
  };

  const openConversationMenu = (event, target) => {
    event.preventDefault();
    event.stopPropagation();
    setConversationMenuAnchorEl(event.currentTarget);
    setConversationMenuTarget(target || null);
  };
  const closeConversationMenu = () => {
    setConversationMenuAnchorEl(null);
    setConversationMenuTarget(null);
  };
  const markDirectConversationRead = async (usernameInput) => {
    const username = String(usernameInput || "").trim();
    if (!username) return;
    try {
      await axios.post(`${API_BASE}/chat/direct/${encodeURIComponent(username)}/read`);
      setUsers((prev) => prev.map((item) => (item.username === username ? { ...item, unreadCount: 0 } : item)));
    } catch (error) {
      console.error(error);
    }
  };
  const markGroupConversationRead = async (groupIdInput) => {
    const groupId = Number(groupIdInput || 0);
    if (!groupId) return;
    try {
      await axios.post(`${API_BASE}/chat/groups/${groupId}/read`);
      setGroups((prev) =>
        prev.map((item) =>
          Number(item.id) === groupId
            ? { ...item, unreadCount: 0, mentionUnreadCount: 0 }
            : item
        )
      );
    } catch (error) {
      console.error(error);
    }
  };
  const deleteDirectConversation = async (usernameInput, displayNameInput) => {
    const username = String(usernameInput || "").trim();
    if (!username) return;
    const targetName = String(displayNameInput || username || "").trim();
    setDeleteConfirmDialog({
      open: true,
      type: "direct",
      username,
      groupId: null,
      name: targetName,
    });
  };
  const confirmDeleteDirectConversation = async (usernameInput) => {
    const username = String(usernameInput || "").trim();
    if (!username) return;
    try {
      await axios.delete(`${API_BASE}/chat/direct/${encodeURIComponent(username)}/conversation`);
      if (String(selectedUsernameRef.current || "") === username) {
        setMessages([]);
        setSelectedUsername("");
      }
      await loadUsers();
      toastApi?.success(t("chatWidget.deleteConversationSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.deleteConversationError"));
    }
  };
  const deleteGroupConversation = async (groupIdInput, groupNameInput) => {
    const groupId = Number(groupIdInput || 0);
    if (!groupId) return;
    setDeleteConfirmDialog({
      open: true,
      type: "group",
      username: "",
      groupId,
      name: String(groupNameInput || `#${groupId}`),
    });
  };
  const confirmDeleteGroupConversation = async (groupIdInput) => {
    const groupId = Number(groupIdInput || 0);
    if (!groupId) return;
    setGroupManaging(true);
    try {
      await axios.delete(`${API_BASE}/chat/groups/${groupId}`);
      if (Number(selectedGroupId || 0) === groupId) {
        setSelectedGroupId(null);
        setGroupMessages([]);
      }
      setGroupSettingsOpen(false);
      await loadGroups();
      toastApi?.success(t("chatWidget.groupDeleteSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupDeleteError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const openMediaPreview = (type, src, name, message = null) => {
    if (!src) return;
    setMediaPreview({
      open: true,
      type: String(type || ""),
      src: String(src || ""),
      name: String(name || ""),
      message: message || null,
      mode: chatMode,
      groupId: selectedGroupId ? Number(selectedGroupId) : null,
    });
  };
  const closeMediaPreview = () => {
    setMediaPreview({ open: false, type: "", src: "", name: "", message: null, mode: "direct", groupId: null });
  };

  const sendAttachmentFile = async (file, caption = "") => {
    const canUpload = chatMode === "group" ? Boolean(selectedGroupId) : Boolean(selectedUsername);
    if (!file || !canUpload) return;
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const nextCaption = String(caption || "").trim();
      if (nextCaption) {
        formData.append("content", nextCaption);
      }
      if (replyingTo?.id) {
        formData.append("replyToId", String(replyingTo.id));
      }
      const endpoint =
        chatMode === "group"
          ? `${API_BASE}/chat/groups/${Number(selectedGroupId)}/attachment`
          : `${API_BASE}/chat/direct/${encodeURIComponent(selectedUsername)}/attachment`;
      const res = await axios.post(endpoint, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (chatMode === "group") {
        setGroupMessages((prev) => {
          if (prev.some((item) => Number(item.id) === Number(res.data?.id))) {
            return prev;
          }
          return [...prev, res.data];
        });
        handleCancelReply();
      } else {
        setMessages((prev) => {
          if (prev.some((item) => Number(item.id) === Number(res.data?.id))) {
            return prev;
          }
          return [...prev, res.data];
        });
        handleCancelReply();
      }
      loadUsers();
      loadGroups();
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data?.message || error?.response?.data || t("chatWidget.uploadAttachmentError"));
    } finally {
      setUploadingAttachment(false);
    }
  };
  const handleAttachmentSelect = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = "";
    await sendAttachmentFile(file);
  };
  const handleImageSelect = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = "";
    await sendAttachmentFile(file);
  };
  const handleVideoSelect = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = "";
    await sendAttachmentFile(file);
  };
  const handleComposerPaste = async (event) => {
    const clipboardItems = event?.clipboardData?.items;
    if (!clipboardItems || !clipboardItems.length) return;
    const imageItem = [...clipboardItems].find((item) => String(item?.type || "").toLowerCase().startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile?.();
    if (!file) return;
    event.preventDefault();
    if (pendingPastedImageUrl) {
      window.URL.revokeObjectURL(pendingPastedImageUrl);
    }
    setPendingPastedImageFile(file);
    setPendingPastedImageUrl(window.URL.createObjectURL(file));
    setPendingPastedImageCaption("");
  };
  const clearPendingPastedImage = () => {
    setPendingPastedImageFile(null);
    if (pendingPastedImageUrl) {
      window.URL.revokeObjectURL(pendingPastedImageUrl);
    }
    setPendingPastedImageUrl("");
    setPendingPastedImageCaption("");
  };
  const startVoiceRecording = async () => {
    if (recordingVoice || uploadingAttachment || sending || pendingVoiceFile) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");
      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      setRecordingVoiceSeconds(0);
      if (voiceRecordTimerRef.current) clearInterval(voiceRecordTimerRef.current);
      voiceRecordTimerRef.current = setInterval(() => {
        setRecordingVoiceSeconds((prev) => Math.min(MAX_VOICE_RECORDING_SECONDS, prev + 1));
      }, 1000);
      if (voiceAutoStopTimerRef.current) clearTimeout(voiceAutoStopTimerRef.current);
      voiceAutoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
          toastApi?.info(t("chatWidget.voiceRecordMaxDurationReached"));
        }
      }, MAX_VOICE_RECORDING_SECONDS * 1000);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        try {
          if (voiceRecordTimerRef.current) clearInterval(voiceRecordTimerRef.current);
          if (voiceAutoStopTimerRef.current) clearTimeout(voiceAutoStopTimerRef.current);
          const mimeType = recorder.mimeType || "audio/webm";
          const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mpeg") ? "mp3" : "webm";
          const blob = new Blob(voiceChunksRef.current, { type: mimeType });
          if (blob.size > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const voiceFile = new File([blob], `voice-${timestamp}.${ext}`, { type: mimeType });
            const previewUrl = window.URL.createObjectURL(blob);
            setPendingVoiceFile(voiceFile);
            setPendingVoiceUrl(previewUrl);
          }
        } finally {
          voiceChunksRef.current = [];
          stream.getTracks().forEach((track) => track.stop());
          mediaRecorderRef.current = null;
          setRecordingVoice(false);
          setRecordingVoiceSeconds(0);
        }
      };
      recorder.start();
      setRecordingVoice(true);
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.voiceRecordPermissionError"));
    }
  };
  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecordingVoice(false);
      return;
    }
    recorder.stop();
  };
  const cancelPendingVoice = () => {
    setPendingVoiceFile(null);
    if (pendingVoiceUrl) {
      window.URL.revokeObjectURL(pendingVoiceUrl);
    }
    setPendingVoiceUrl("");
  };
  const sendPendingVoice = async () => {
    if (!pendingVoiceFile) return;
    const nextFile = pendingVoiceFile;
    cancelPendingVoice();
    await sendAttachmentFile(nextFile);
  };
  const getAttachmentSourceUrl = (message) => {
    const raw = String(message?.attachmentUrl || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${API_BASE}/uploads/${encodeURIComponent(raw)}`;
  };
  const isImageAttachment = (message) => String(message?.attachmentMime || "").toLowerCase().startsWith("image/");
  const isVideoAttachment = (message) => String(message?.attachmentMime || "").toLowerCase().startsWith("video/");
  const isAudioAttachment = (message) => String(message?.attachmentMime || "").toLowerCase().startsWith("audio/");

  useEffect(() => {
    if (!mediaPreview.open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMediaPreview();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mediaPreview.open]);

  const handleDownloadAttachment = async (message, context = {}) => {
    try {
      const effectiveMode = context.mode || chatMode;
      const effectiveGroupId = Number(context.groupId || selectedGroupId || 0);
      const downloadUrl =
        effectiveMode === "group"
          ? `${API_BASE}/chat/groups/${effectiveGroupId}/messages/${message.id}/download`
          : `${API_BASE}/chat/direct/messages/${message.id}/download`;
      const res = await axios.get(downloadUrl, {
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = message.attachmentName || `attachment-${message.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.downloadAttachmentError"));
    }
  };

  const handleStartEdit = (message) => {
    if (!message?.isMine || message?.isDeleted) return;
    setEditingMessageId(Number(message.id));
    setDraft(String(message.content || ""));
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setDraft("");
  };
  const handleStartReply = (message) => {
    if (!message) return;
    const baseSnippet = message.isDeleted
      ? t("chatWidget.messageDeleted")
      : message.attachmentName
        ? `[${t("chatWidget.attachmentLabel")}] ${message.attachmentName}`
        : (message.content || "");
    setReplyingTo({
      id: message.id,
      sender: message.senderUsername || (message.isMine ? currentUser?.username : selectedUsername),
      snippet: String(baseSnippet).slice(0, 180),
    });
    const quoteSender = String(message.senderFullName || message.senderUsername || t("chatWidget.replyingTo")).trim();
    const quoteSnippet = String(baseSnippet || "").trim() || t("chatWidget.messageDeleted");
    const quoteBlock = `> ${quoteSender}: ${quoteSnippet}\n`;
    setQuoteDraftPrefix(quoteBlock);
    setDraft((prev) => {
      const current = String(prev || "");
      return current.includes(quoteBlock) ? current : `${quoteBlock}${current}`;
    });
    setTimeout(() => {
      if (composerInputRef.current && typeof composerInputRef.current.focus === "function") {
        composerInputRef.current.focus();
      }
    }, 0);
    setEditingMessageId(null);
  };
  const handleCancelReply = () => {
    setReplyingTo(null);
    if (quoteDraftPrefix) {
      setDraft((prev) => {
        const current = String(prev || "");
        return current.startsWith(quoteDraftPrefix) ? current.slice(quoteDraftPrefix.length) : current;
      });
      setQuoteDraftPrefix("");
    }
  };
  const getReactionKey = (message) => {
    return Number(message?.id || 0);
  };
  const getReactionRows = (message) => {
    const key = getReactionKey(message);
    if (!key) return [];
    const byEmoji = message?.reactions && typeof message.reactions === "object" ? message.reactions : {};
    return Object.entries(byEmoji)
      .map(([emoji, usernames]) => {
        const list = Array.isArray(usernames) ? usernames.filter(Boolean) : [];
        return { emoji, count: list.length, mine: list.includes(String(currentUser?.username || "")) };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  };
  const toggleReaction = async (message, emoji) => {
    if (!message?.id || !emoji) return;
    try {
      if (chatMode === "group") {
        const groupId = Number(selectedGroupId || message.groupId || 0);
        if (!groupId) return;
        const res = await axios.post(
          `${API_BASE}/chat/groups/${groupId}/messages/${Number(message.id)}/reactions`,
          { emoji }
        );
        const next = res?.data?.reactions || {};
        setGroupMessages((prev) =>
          prev.map((item) => (Number(item.id) === Number(message.id) ? { ...item, reactions: next } : item))
        );
      } else {
        const res = await axios.post(`${API_BASE}/chat/direct/messages/${Number(message.id)}/reactions`, { emoji });
        const next = res?.data?.reactions || {};
        setMessages((prev) =>
          prev.map((item) => (Number(item.id) === Number(message.id) ? { ...item, reactions: next } : item))
        );
      }
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.sendError"));
    } finally {
      setReactionPickerMessageId(null);
    }
  };
  const toggleReactionPicker = (event, message) => {
    event.stopPropagation();
    const nextId = Number(message?.id || 0);
    if (!nextId) return;
    setReactionPickerMessageId((prev) => (Number(prev || 0) === nextId ? null : nextId));
  };
  const insertEmoji = (emoji) => {
    setDraft((prev) => `${prev || ""}${emoji}`);
    setEmojiAnchorEl(null);
  };
  const refreshMentionState = (nextDraft, targetEl = null) => {
    if (chatMode !== "group") {
      setMentionQuery("");
      setMentionAnchorEl(null);
      setMentionRange(null);
      return;
    }
    const inputEl = targetEl || composerInputRef.current;
    const caret = Number(inputEl?.selectionStart ?? String(nextDraft || "").length);
    const beforeCaret = String(nextDraft || "").slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s)@([^\n@]{0,120})$/u);
    if (!match) {
      setMentionQuery("");
      setMentionAnchorEl(null);
      setMentionActiveIndex(0);
      setMentionRange(null);
      return;
    }
    setMentionQuery(String(match[1] || ""));
    const mentionText = `@${String(match[1] || "")}`;
    const mentionEnd = caret;
    const mentionStart = mentionEnd - mentionText.length;
    setMentionRange({ start: mentionStart, end: mentionEnd });
    setMentionAnchorEl(inputEl || null);
  };
  const applyMention = (member) => {
    if (!member) return;
    const mentionText = String(member.fullName || member.username || "").trim();
    if (!mentionText) return;
    const current = String(draft || "");
    let next = current;
    let nextCaret = current.length;
    if (mentionRange && Number.isInteger(mentionRange.start) && Number.isInteger(mentionRange.end)) {
      const prefix = current.slice(0, mentionRange.start);
      const suffix = current.slice(mentionRange.end);
      const replacement = `@{${mentionText}} `;
      next = `${prefix}${replacement}${suffix}`;
      nextCaret = prefix.length + replacement.length;
    } else {
      next = `${current.trimEnd()} @{${mentionText}} `;
      nextCaret = next.length;
    }
    setDraft(next);
    setMentionQuery("");
    setMentionAnchorEl(null);
    setMentionActiveIndex(0);
    setMentionRange(null);
    setTimeout(() => {
      if (composerInputRef.current && typeof composerInputRef.current.setSelectionRange === "function") {
        composerInputRef.current.focus();
        composerInputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    }, 0);
  };
  const handleMentionClick = (username) => {
    const nextUsername = String(username || "").trim();
    if (!nextUsername || nextUsername === currentUser?.username) return;
    setChatMode("direct");
    setSelectedUsername(nextUsername);
    setUserSearch("");
    setMentionAnchorEl(null);
  };
  const resolveMentionTarget = (mentionText = "", message = null) => {
    const text = String(mentionText || "").trim();
    if (!text) return null;
    const members = selectedGroup?.members || [];
    const byUsername = new Map(
      members.map((member) => [String(member.username || "").toLowerCase(), member])
    );
    const byFullName = new Map(
      members.map((member) => [String(member.fullName || "").trim().toLowerCase(), member])
    );
    if (text.startsWith("@{") && text.endsWith("}")) {
      const fullName = text.slice(2, -1).trim();
      const member = byFullName.get(String(fullName || "").toLowerCase());
      if (member?.username) {
        return {
          username: member.username,
          display: `@${member.fullName || member.username}`,
        };
      }
      return { username: "", display: `@${fullName}` };
    }
    if (text.startsWith("@")) {
      const raw = text.slice(1).trim();
      const mentionUsernames = Array.isArray(message?.mentions) ? message.mentions : [];
      const fromMentionList = mentionUsernames.find((username) => String(username || "").toLowerCase() === raw.toLowerCase());
      const username = String(fromMentionList || raw || "").trim();
      const member = byUsername.get(username.toLowerCase());
      if (member?.username) {
        return {
          username: member.username,
          display: `@${member.fullName || member.username}`,
        };
      }
      return { username, display: `@${username}` };
    }
    return null;
  };
  const renderMessageContent = (message) => {
    const raw = message?.isDeleted ? t("chatWidget.messageDeleted") : String(message?.content || "");
    if (!raw) return null;
    const regex = /(@\{[^{}]{1,120}\}|@[^\s@]{3,120})/gu;
    const parts = [];
    let last = 0;
    let match = regex.exec(raw);
    while (match) {
      if (match.index > last) {
        parts.push({ type: "text", value: raw.slice(last, match.index) });
      }
      parts.push({ type: "mention", value: match[0] });
      last = match.index + match[0].length;
      match = regex.exec(raw);
    }
    if (last < raw.length) {
      parts.push({ type: "text", value: raw.slice(last) });
    }
    return parts.map((part, idx) => {
      if (part.type !== "mention") return <span key={`text-${idx}`}>{part.value}</span>;
      const mentionTarget = resolveMentionTarget(part.value, message);
      return (
        <Box
          key={`mention-${idx}`}
          component="span"
          onClick={() => mentionTarget?.username && handleMentionClick(mentionTarget.username)}
          sx={{
            px: 0.7,
            py: 0.18,
            borderRadius: 1.4,
            bgcolor: message?.isMine ? "rgba(255,255,255,0.24)" : "rgba(37,99,235,0.16)",
            border: "1px solid",
            borderColor: message?.isMine ? "rgba(255,255,255,0.45)" : "rgba(37,99,235,0.28)",
            fontWeight: 700,
            cursor: mentionTarget?.username ? "pointer" : "default",
            transition: "all 0.15s ease",
            "&:hover": mentionTarget?.username
              ? {
                  bgcolor: message?.isMine ? "rgba(255,255,255,0.3)" : "rgba(37,99,235,0.24)",
                }
              : undefined,
          }}
        >
          {mentionTarget?.display || part.value}
        </Box>
      );
    });
  };
  const togglePinnedGroup = (groupId) => {
    const id = Number(groupId);
    setPinnedGroupIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };
  const toggleMutedDirect = (usernameInput) => {
    const username = String(usernameInput || "").trim();
    if (!username) return;
    setMutedDirectUsernames((prev) =>
      prev.includes(username) ? prev.filter((item) => item !== username) : [...prev, username]
    );
  };
  const toggleMutedGroup = (groupIdInput) => {
    const groupId = Number(groupIdInput || 0);
    if (!groupId) return;
    setMutedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((item) => item !== groupId) : [...prev, groupId]));
  };
  const applyMyStatus = async (statusRaw) => {
    const status = normalizeStatus(statusRaw);
    if (!status) return;
    try {
      await axios.patch(API_BASE + "/chat/presence/status", { status });
      setMyChatStatus(status);
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.statusUpdateError"));
    } finally {
      setStatusMenuAnchorEl(null);
    }
  };
  const jumpGroupSearchResult = (step) => {
    if (!filteredGroupMessages.length) return;
    setGroupSearchIndex((prev) => {
      const next = (prev + step + filteredGroupMessages.length) % filteredGroupMessages.length;
      return next;
    });
  };
  const openCreateGroupDialog = async () => {
    setGroupDialogOpen(true);
    setGroupNameDraft("");
    setGroupMemberSearch("");
    setGroupMemberUsernames([]);
    setGroupShowFullDirectory(false);
    if (!directoryUsers.length) {
      await loadDirectoryUsers();
    }
  };
  const toggleGroupMember = (username) => {
    setGroupMemberUsernames((prev) =>
      prev.includes(username) ? prev.filter((item) => item !== username) : [...prev, username]
    );
  };
  const createGroupChat = async () => {
    const name = String(groupNameDraft || "").trim();
    if (!name) {
      toastApi?.warning(t("chatWidget.groupNameRequired"));
      return;
    }
    if (!groupMemberUsernames.length) {
      toastApi?.warning(t("chatWidget.groupMembersRequired"));
      return;
    }
    setCreatingGroup(true);
    try {
      const res = await axios.post(API_BASE + "/chat/groups", {
        name,
        memberUsernames: groupMemberUsernames,
      });
      await loadGroups();
      setChatMode("group");
      setSelectedGroupId(Number(res?.data?.id || 0) || null);
      setGroupDialogOpen(false);
      toastApi?.success(t("chatWidget.groupCreateSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(t("chatWidget.groupCreateError"));
    } finally {
      setCreatingGroup(false);
    }
  };
  const openGroupSettings = async (groupIdInput = null) => {
    const targetId = Number(groupIdInput || selectedGroupId || 0);
    const targetGroup =
      groups.find((item) => Number(item.id) === targetId) ||
      selectedGroup ||
      null;
    if (!targetGroup) return;
    await loadDirectoryUsers();
    setSelectedGroupId(Number(targetGroup.id));
    setGroupSettingsOpen(true);
    setGroupRenameDraft(String(targetGroup.name || ""));
    setGroupAddMemberSelections([]);
    setGroupAddMemberQuery("");
    setGroupMembersQuery("");
  };
  const renameGroup = async () => {
    if (!selectedGroup) return;
    const name = String(groupRenameDraft || "").trim();
    if (!name) return;
    setGroupManaging(true);
    try {
      await axios.patch(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}`, { name });
      await loadGroups();
      toastApi?.success(t("chatWidget.groupRenameSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupRenameError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const addGroupMember = async () => {
    if (!selectedGroup) return;
    const usernames = [...new Set(groupAddMemberSelections)]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (!usernames.length) return;
    setGroupManaging(true);
    try {
      for (const username of usernames) {
        // Sequential add to preserve existing backend validation behavior and clear errors.
        // eslint-disable-next-line no-await-in-loop
        await axios.post(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}/members`, { username });
      }
      setGroupAddMemberSelections([]);
      await loadGroups();
      toastApi?.success(t("chatWidget.groupAddMemberSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupAddMemberError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const removeGroupMember = async (username) => {
    if (!selectedGroup || !username) return;
    setGroupManaging(true);
    try {
      await axios.delete(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}/members/${encodeURIComponent(username)}`);
      await loadGroups();
      toastApi?.success(t("chatWidget.groupRemoveMemberSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupRemoveMemberError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const promoteGroupAdmin = async (username) => {
    if (!selectedGroup || !username) return;
    setGroupManaging(true);
    try {
      await axios.post(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}/admins`, { username });
      await loadGroups();
      toastApi?.success(t("chatWidget.groupPromoteAdminSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupPromoteAdminError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const demoteGroupAdmin = async (username) => {
    if (!selectedGroup || !username) return;
    setGroupManaging(true);
    try {
      await axios.delete(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}/admins/${encodeURIComponent(username)}`);
      await loadGroups();
      toastApi?.success(t("chatWidget.groupDemoteAdminSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupDemoteAdminError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const transferGroupOwner = async (username) => {
    if (!selectedGroup || !username || !canTransferSelectedGroupOwner) return;
    setGroupManaging(true);
    try {
      await axios.post(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}/transfer-owner`, { username });
      await loadGroups();
      toastApi?.success(t("chatWidget.groupTransferOwnerSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupTransferOwnerError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const leaveGroup = async () => {
    if (!selectedGroup) return;
    setGroupManaging(true);
    try {
      await axios.post(`${API_BASE}/chat/groups/${Number(selectedGroup.id)}/leave`);
      setGroupSettingsOpen(false);
      setSelectedGroupId(null);
      await loadGroups();
      toastApi?.success(t("chatWidget.groupLeaveSuccess"));
    } catch (error) {
      console.error(error);
      toastApi?.error(error?.response?.data || t("chatWidget.groupLeaveError"));
    } finally {
      setGroupManaging(false);
    }
  };
  const deleteGroup = async () => {
    if (!selectedGroup || !canDeleteSelectedGroup) return;
    await deleteGroupConversation(selectedGroup.id, selectedGroup.name);
  };
  const closeDeleteConfirmDialog = () => {
    setDeleteConfirmDialog({
      open: false,
      type: "",
      username: "",
      groupId: null,
      name: "",
    });
  };
  const handleConfirmDeleteConversation = async () => {
    if (deleteConfirmDialog.type === "direct") {
      await confirmDeleteDirectConversation(deleteConfirmDialog.username);
    } else if (deleteConfirmDialog.type === "group") {
      await confirmDeleteGroupConversation(deleteConfirmDialog.groupId);
    }
    closeDeleteConfirmDialog();
  };

  return (
    <>
      {!open && (
        <Box
          sx={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 1300,
          }}
        >
          <Badge badgeContent={totalUnreadCount} color="error" overlap="circular">
            <IconButton
              onClick={() => {
                unlockAudioIfNeeded();
                setOpen(true);
              }}
              sx={{
                width: 56,
                height: 56,
                bgcolor: "primary.main",
                color: "#fff",
                boxShadow: "0 10px 24px rgba(37,99,235,0.35)",
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              <ChatIcon />
            </IconButton>
          </Badge>
        </Box>
      )}

      {open && (
        <Portal>
          <Paper
            sx={{
              position: "fixed",
              right: 18,
              bottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
              width: { xs: "calc(100vw - 24px)", sm: 740 },
              maxWidth: "calc(100vw - 24px)",
              height: { xs: "min(72dvh, 640px)", sm: "min(78dvh, 760px)" },
              zIndex: 2000,
              borderRadius: 2.5,
              overflow: "hidden",
              boxShadow: "0 24px 54px rgba(2,6,23,0.35)",
              border: "1px solid rgba(148,163,184,0.28)",
              bgcolor: "rgba(248,250,252,0.94)",
              backdropFilter: "blur(10px)",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "260px 1fr" },
            }}
          >
          <Box
            sx={{
              borderRight: { xs: "none", sm: "1px solid" },
              borderColor: "rgba(148,163,184,0.28)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              bgcolor: "rgba(241,245,249,0.82)",
            }}
          >
            <Box
              sx={{
                px: 1.75,
                py: 1.25,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                bgcolor: "rgba(255,255,255,0.82)",
                color: "text.primary",
                borderBottom: "1px solid rgba(148,163,184,0.28)",
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 850,
                    letterSpacing: 0.1,
                    color: "text.primary",
                    lineHeight: 1.2,
                  }}
                  noWrap
                >
                  {String(currentUser?.fullName || currentUser?.username || "").trim() || t("chatWidget.title")}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                <Button
                  size="small"
                  onClick={(e) => setStatusMenuAnchorEl(e.currentTarget)}
                  sx={{ borderRadius: 999, minWidth: 0, px: 0.6, color: "text.secondary" }}
                >
                  <FiberManualRecordIcon
                    sx={{
                      fontSize: 13,
                      color:
                        getStatusColor(myChatStatus, myChatStatus !== "INVISIBLE") === "error"
                          ? "error.main"
                          : getStatusColor(myChatStatus, myChatStatus !== "INVISIBLE") === "warning"
                            ? "warning.main"
                            : getStatusColor(myChatStatus, myChatStatus !== "INVISIBLE") === "secondary"
                              ? "secondary.main"
                              : getStatusColor(myChatStatus, myChatStatus !== "INVISIBLE") === "default"
                                ? "text.disabled"
                                : "success.main",
                    }}
                  />
                </Button>
                <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: "text.secondary" }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            <Box
              sx={{
                px: 1.5,
                pt: 1.25,
                pb: 1,
                display: "flex",
                gap: 0.9,
                alignItems: "center",
                borderBottom: "1px solid rgba(148,163,184,0.2)",
                bgcolor: "rgba(248,250,252,0.72)",
              }}
            >
              <Box
                sx={{
                  display: "inline-flex",
                  p: 0.5,
                  gap: 0.5,
                  borderRadius: 999,
                  bgcolor: "rgba(226,232,240,0.7)",
                  border: "1px solid rgba(148,163,184,0.25)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                }}
              >
                <Button
                  size="small"
                  onClick={() => setChatMode("direct")}
                  sx={{
                    minWidth: 72,
                    borderRadius: 999,
                    px: 1.5,
                    fontWeight: 700,
                    color: chatMode === "direct" ? "#fff" : "text.primary",
                    bgcolor: chatMode === "direct" ? "primary.main" : "transparent",
                    boxShadow: chatMode === "direct" ? "0 6px 14px rgba(37,99,235,0.32)" : "none",
                    "&:hover": {
                      bgcolor: chatMode === "direct" ? "primary.main" : "rgba(148,163,184,0.16)",
                    },
                  }}
                >
                  {t("chatWidget.directTab")}
                </Button>
                <Button
                  size="small"
                  onClick={() => setChatMode("group")}
                  sx={{
                    minWidth: 78,
                    borderRadius: 999,
                    px: 1.5,
                    fontWeight: 700,
                    color: chatMode === "group" ? "#fff" : "text.primary",
                    bgcolor: chatMode === "group" ? "primary.main" : "transparent",
                    boxShadow: chatMode === "group" ? "0 6px 14px rgba(37,99,235,0.32)" : "none",
                    "&:hover": {
                      bgcolor: chatMode === "group" ? "primary.main" : "rgba(148,163,184,0.16)",
                    },
                  }}
                >
                  {t("chatWidget.groupTab")}
                </Button>
              </Box>
              <Button
                size="small"
                onClick={openCreateGroupDialog}
                sx={{
                  borderRadius: 999,
                  px: 1.6,
                  ml: "auto",
                  fontWeight: 700,
                  border: "1px solid rgba(37,99,235,0.35)",
                  bgcolor: "rgba(255,255,255,0.8)",
                }}
              >
                {t("chatWidget.createGroup")}
              </Button>
            </Box>
            <Divider />
            <Box sx={{ p: 1 }}>
              <TextField
                inputRef={searchInputRef}
                size="small"
                fullWidth
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("chatWidget.searchUsersPlaceholder")}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: String(userSearch || "").length > 0 ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label={t("common.clear")}
                          sx={{
                            width: 22,
                            height: 22,
                            bgcolor: "rgba(148,163,184,0.22)",
                            color: "text.secondary",
                            "&:hover": {
                              bgcolor: "rgba(148,163,184,0.35)",
                              color: "text.primary",
                            },
                          }}
                          onClick={() => {
                            setUserSearch("");
                            setSearchNavIndex(-1);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : undefined,
                  },
                }}
              />
              {normalizedSearchQuery && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  {t("chatWidget.searchResultsCount", {
                    count: chatMode === "group" ? filteredGroups.length : filteredUsers.length,
                  })}
                  {searchEntries.length > 0 ? ` • ${t("chatWidget.searchKeyboardHint")}` : ""}
                </Typography>
              )}
              {normalizedSearchQuery && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.7, flexWrap: "wrap" }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${t("chatWidget.searchSectionUsers")}: ${filteredUsers.length}`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${t("chatWidget.searchScopeMessages")}: ${
                      chatMode === "group" ? groupMessageMatches.length : directMessageMatches.length
                    }`}
                  />
                  <Chip
                    size="small"
                    color="error"
                    variant="outlined"
                    label={`${t("chatWidget.unreadOnly")}: ${
                      chatMode === "group"
                        ? filteredGroups.filter((item) => Number(item.unreadCount || 0) > 0).length
                        : filteredUsers.filter((item) => Number(item.unreadCount || 0) > 0).length
                    }`}
                  />
                </Stack>
              )}
            </Box>
            <Box sx={{ overflowY: "auto", overflowX: "auto", flex: 1, minHeight: 0, p: 1 }}>
              {chatMode === "group" ? (
                loadingGroups ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    {t("common.loading")}
                  </Typography>
                ) : filteredGroups.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    {t("chatWidget.noGroupsFound")}
                  </Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {normalizedSearchQuery && (
                      <Typography variant="caption" sx={{ px: 0.6, color: "text.secondary", fontWeight: 700 }}>
                        {t("chatWidget.searchSectionGroups")}
                      </Typography>
                    )}
                    {filteredGroups.map((item) => (
                      (() => {
                        const entryKey = `group:${Number(item.id)}`;
                        const isSearchFocused =
                          normalizedSearchQuery &&
                          searchNavIndex >= 0 &&
                          searchEntries[searchNavIndex]?.key === entryKey;
                        return (
                      <Button
                        key={item.id}
                        onClick={() => setSelectedGroupId(Number(item.id))}
                        sx={{
                          width: "max-content",
                          minWidth: "100%",
                          display: "flex",
                          justifyContent: "flex-start",
                          alignItems: "flex-start",
                          textTransform: "none",
                          px: 1,
                          py: 1,
                          borderRadius: 1.5,
                          border: "1px solid",
                          borderColor:
                            Number(selectedGroupId) === Number(item.id) ? "rgba(59,130,246,0.42)" : "transparent",
                          bgcolor:
                            Number(selectedGroupId) === Number(item.id)
                              ? "rgba(59,130,246,0.10)"
                              : "rgba(255,255,255,0.72)",
                          outline: isSearchFocused ? "2px solid rgba(37,99,235,0.5)" : "none",
                          outlineOffset: isSearchFocused ? "-1px" : 0,
                          "& .conversation-actions": {
                            opacity: Number(selectedGroupId) === Number(item.id) ? 1 : 0,
                            pointerEvents: Number(selectedGroupId) === Number(item.id) ? "auto" : "none",
                            transition: "opacity 0.15s ease",
                          },
                          "&:hover .conversation-actions, &:focus-within .conversation-actions": {
                            opacity: 1,
                            pointerEvents: "auto",
                          },
                        }}
                      >
                        <Avatar sx={{ width: 30, height: 30, mr: 1 }}>
                          {String(item.name || "G").slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Box sx={{ textAlign: "left", minWidth: 0, width: "100%", flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {renderHighlightedText(item.name, normalizedSearchQuery)}
                            {pinnedGroupIds.includes(Number(item.id)) ? " 📌" : ""}
                            {mutedGroupIds.includes(Number(item.id)) ? " 🔕" : ""}
                          </Typography>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {(item.members || []).length} {t("chatWidget.members")}
                            </Typography>
                            {Number(item.mentionUnreadCount || 0) > 0 && (
                              <Chip size="small" color="warning" label={`@${item.mentionUnreadCount}`} sx={{ height: 18 }} />
                            )}
                            {Number(item.unreadCount || 0) > 0 && (
                              <Chip size="small" color="error" label={item.unreadCount} sx={{ height: 18 }} />
                            )}
                          </Stack>
                          {normalizedSearchQuery && Boolean(getSearchSnippet(item.lastMessageText, normalizedSearchQuery)) && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: 0.2 }}>
                              {t("chatWidget.matchedInMessage")}:{" "}
                              {renderHighlightedText(
                                getSearchSnippet(item.lastMessageText, normalizedSearchQuery),
                                normalizedSearchQuery
                              )}
                            </Typography>
                          )}
                        </Box>
                        {(() => {
                          const owner = (item.members || []).find((member) => Number(member.id) === Number(item.ownerId));
                          const ownerUsername = String(owner?.username || "");
                          const selfMember = (item.members || []).find(
                            (member) => String(member.username || "") === String(currentUser?.username || "")
                          );
                          const canManageThisGroup =
                            String(currentUser?.role || "").toLowerCase() === "admin" ||
                            ownerUsername === String(currentUser?.username || "") ||
                            Boolean(selfMember?.isAdmin);
                          const canDeleteThisGroup =
                            ownerUsername === String(currentUser?.username || "");
                          return (
                            <IconButton
                              className="conversation-actions"
                              component="span"
                              size="small"
                              onClick={(event) =>
                                openConversationMenu(event, {
                                  type: "group",
                                  groupId: Number(item.id),
                                  name: item.name,
                                  unreadCount: Number(item.unreadCount || 0),
                                  mentionUnreadCount: Number(item.mentionUnreadCount || 0),
                                  canManageGroup: canManageThisGroup,
                                  canDeleteGroup: canDeleteThisGroup,
                                  muted: mutedGroupIds.includes(Number(item.id)),
                                })
                              }
                              sx={{ ml: 0.5 }}
                            >
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          );
                        })()}
                      </Button>
                        );
                      })()
                    ))}
                    {normalizedSearchQuery && groupMessageMatches.length > 0 && (
                      <>
                        <Typography variant="caption" sx={{ px: 0.6, pt: 0.5, color: "text.secondary", fontWeight: 700 }}>
                          {t("chatWidget.searchScopeMessages")}
                        </Typography>
                        <Typography variant="caption" sx={{ px: 0.6, color: "text.disabled", display: "block" }}>
                          {t("chatWidget.searchTopResultsHint", {
                            count: Math.min(MESSAGE_SEARCH_TOP_N, groupMessageMatches.length),
                          })}
                        </Typography>
                        {groupMessageMatches.map((item) => (
                          <Button
                            key={`group-msg-${item.id}`}
                            onClick={() => setSelectedGroupId(Number(item.id))}
                            sx={{
                              justifyContent: "flex-start",
                              textTransform: "none",
                              px: 1,
                              py: 0.6,
                              borderRadius: 1.5,
                              border: "1px dashed rgba(59,130,246,0.35)",
                              bgcolor: Number(item.unreadCount || 0) > 0 ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.66)",
                            }}
                          >
                            <Box sx={{ textAlign: "left", minWidth: 0 }}>
                              <Typography variant="caption" fontWeight={700} noWrap>
                                {item.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                {renderHighlightedText(item.snippet, normalizedSearchQuery)}
                              </Typography>
                            </Box>
                          </Button>
                        ))}
                      </>
                    )}
                  </Stack>
                )
              ) : filteredUsers.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                  {t("chatWidget.noUsersFound")}
                </Typography>
              ) : (
                <Stack spacing={0.5}>
                  {normalizedSearchQuery && (
                    <Typography variant="caption" sx={{ px: 0.6, color: "text.secondary", fontWeight: 700 }}>
                      {t("chatWidget.searchSectionUsers")}
                    </Typography>
                  )}
                  {filteredUsers.map((item) => (
                    (() => {
                      const entryKey = `direct:${String(item.username || "")}`;
                      const isSearchFocused =
                        normalizedSearchQuery &&
                        searchNavIndex >= 0 &&
                        searchEntries[searchNavIndex]?.key === entryKey;
                      return (
                    <Button
                      key={item.username}
                      onClick={() => setSelectedUsername(item.username)}
                      sx={{
                        justifyContent: "flex-start",
                        textTransform: "none",
                        px: 1,
                        py: 0.75,
                        borderRadius: 1.5,
                          border: "1px solid",
                          borderColor:
                            selectedUsername === item.username ? "rgba(59,130,246,0.42)" : "transparent",
                          bgcolor:
                            selectedUsername === item.username
                              ? "rgba(59,130,246,0.10)"
                              : "rgba(255,255,255,0.72)",
                        outline: isSearchFocused ? "2px solid rgba(37,99,235,0.5)" : "none",
                        outlineOffset: isSearchFocused ? "-1px" : 0,
                        "& .conversation-actions": {
                          opacity: selectedUsername === item.username ? 1 : 0,
                          pointerEvents: selectedUsername === item.username ? "auto" : "none",
                          transition: "opacity 0.15s ease",
                        },
                        "&:hover .conversation-actions, &:focus-within .conversation-actions": {
                          opacity: 1,
                          pointerEvents: "auto",
                        },
                      }}
                    >
                      <Badge
                        overlap="circular"
                        variant="dot"
                        color={getStatusColor(item.status, item.online)}
                        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                      >
                        <Avatar src={item.avatarUrl || undefined} sx={{ width: 30, height: 30, mr: 1 }}>
                          {String(item.fullName || item.username || "U").slice(0, 1).toUpperCase()}
                        </Avatar>
                      </Badge>
                      <Box sx={{ textAlign: "left", minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {renderHighlightedText(item.fullName || item.username, normalizedSearchQuery)}
                          {mutedDirectUsernames.includes(String(item.username || "")) ? " 🔕" : ""}
                        </Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {getStatusLabel(item.status, item.online)}
                          </Typography>
                          {Number(item.unreadCount || 0) > 0 && (
                            <Chip size="small" color="error" label={item.unreadCount} sx={{ height: 18 }} />
                          )}
                        </Stack>
                        {(() => {
                          const matchedSnippetRaw =
                            directMessageSearchByUser[String(item.username || "")]?.snippet || item.lastMessageText;
                          const matchedSnippet = getSearchSnippet(matchedSnippetRaw, normalizedSearchQuery);
                          return normalizedSearchQuery && Boolean(matchedSnippet) ? (
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: 0.2 }}>
                            {t("chatWidget.matchedInMessage")}:{" "}
                            {renderHighlightedText(
                              matchedSnippet,
                              normalizedSearchQuery
                            )}
                          </Typography>
                          ) : null;
                        })()}
                      </Box>
                      <IconButton
                        className="conversation-actions"
                        component="span"
                        size="small"
                        onClick={(event) =>
                          openConversationMenu(event, {
                            type: "direct",
                            username: item.username,
                            name: item.fullName || item.username,
                            unreadCount: Number(item.unreadCount || 0),
                            muted: mutedDirectUsernames.includes(String(item.username || "")),
                          })
                        }
                        sx={{ ml: "auto" }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Button>
                      );
                    })()
                  ))}
                  {normalizedSearchQuery && directMessageMatches.length > 0 && (
                    <>
                      <Typography variant="caption" sx={{ px: 0.6, pt: 0.5, color: "text.secondary", fontWeight: 700 }}>
                        {t("chatWidget.searchScopeMessages")}
                      </Typography>
                      <Typography variant="caption" sx={{ px: 0.6, color: "text.disabled", display: "block" }}>
                        {t("chatWidget.searchTopResultsHint", {
                          count: Math.min(MESSAGE_SEARCH_TOP_N, directMessageMatches.length),
                        })}
                      </Typography>
                      {directMessageMatches.map((item) => (
                        <Button
                          key={`direct-msg-${item.username}`}
                          onClick={() => setSelectedUsername(item.username)}
                          sx={{
                            justifyContent: "flex-start",
                            textTransform: "none",
                            px: 1,
                            py: 0.6,
                            borderRadius: 1.5,
                            border: "1px dashed rgba(59,130,246,0.35)",
                            bgcolor: Number(item.unreadCount || 0) > 0 ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.66)",
                          }}
                        >
                          <Box sx={{ textAlign: "left", minWidth: 0 }}>
                            <Typography variant="caption" fontWeight={700} noWrap>
                              {item.fullName || item.username}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                              {renderHighlightedText(item.snippet, normalizedSearchQuery)}
                            </Typography>
                          </Box>
                        </Button>
                      ))}
                    </>
                  )}
                </Stack>
              )}
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, bgcolor: "rgba(255,255,255,0.88)" }}>
            <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "rgba(148,163,184,0.24)", bgcolor: "rgba(255,255,255,0.74)" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.15 }}>
                {chatMode === "group"
                  ? selectedGroup?.name || t("chatWidget.selectGroup")
                  : selectedUser
                    ? selectedUser.fullName
                    : t("chatWidget.selectUser")}
              </Typography>
              {chatMode === "group" && selectedGroup && (
                <Typography variant="caption" color="text.secondary">
                  {(selectedGroup.members || [])
                    .slice(0, 5)
                    .map((member) => member.fullName || member.username)
                    .join(", ")}
                </Typography>
              )}
              {chatMode === "group" && selectedGroup && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center" }}>
                  <TextField
                    size="small"
                    placeholder={t("chatWidget.searchMessagesPlaceholder")}
                    value={groupMessageSearch}
                    onChange={(e) => setGroupMessageSearch(e.target.value)}
                    sx={{ flex: 1 }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                        endAdornment: String(groupMessageSearch || "").length > 0 ? (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setGroupMessageSearch("")}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ) : undefined,
                      },
                    }}
                  />
                  <Button
                    size="small"
                    disabled={!filteredGroupMessages.length}
                    onClick={() => jumpGroupSearchResult(-1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="small"
                    disabled={!filteredGroupMessages.length}
                    onClick={() => jumpGroupSearchResult(1)}
                  >
                    ↓
                  </Button>
                </Box>
              )}
              {chatMode === "direct" && selectedUser && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  {getStatusLabel(selectedUser.status, selectedUser.online)}
                </Typography>
              )}
              {chatMode === "direct" && peerTyping && (
                <Typography variant="caption" color="primary.main" sx={{ display: "block" }}>
                  {t("chatWidget.peerTyping")}
                </Typography>
              )}
            </Box>

            <Box
              ref={messageListRef}
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                p: 1.5,
                pb: 1,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                bgcolor: "rgba(248,250,252,0.55)",
              }}
            >
              {chatMode === "group" && !selectedGroupId ? (
                <Typography variant="body2" color="text.secondary">
                  {t("chatWidget.selectGroupHint")}
                </Typography>
              ) : chatMode === "direct" && !selectedUsername ? (
                <Typography variant="body2" color="text.secondary">
                  {t("chatWidget.selectUserHint")}
                </Typography>
              ) : loadingMessages ? (
                <Typography variant="body2" color="text.secondary">
                  {t("common.loading")}
                </Typography>
              ) : activeRenderedMessages.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t("chatWidget.noMessages")}
                </Typography>
              ) : (
                <>
                  {chatMode === "direct" && hasMore && (
                    <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5 }}>
                      <Button size="small" onClick={loadMoreMessages} disabled={loadingMore}>
                        {loadingMore ? t("common.loading") : t("chatWidget.loadMore")}
                      </Button>
                    </Box>
                  )}
                  {activeRenderedMessages.map((message, idx) => {
                    const isLatestMine =
                      message.isMine &&
                      !activeRenderedMessages
                        .slice(idx + 1)
                        .some((item) => item?.isMine && Number(item.id || 0) > Number(message.id || 0));
                    return (
                    <Box
                      key={message.id}
                      sx={{
                        alignSelf: message.isMine ? "flex-end" : "flex-start",
                        maxWidth: "72%",
                        bgcolor: message.isMine ? "primary.main" : "grey.100",
                        color: message.isMine ? "#fff" : "text.primary",
                        px: 1.2,
                        py: 0.9,
                        borderRadius: 1.8,
                        outline:
                          chatMode === "group" && groupMessageSearch && idx === groupSearchIndex
                            ? "2px solid #f59e0b"
                            : "none",
                        "& .message-action-bar": {
                          opacity: 0,
                          pointerEvents: "none",
                          transition: "opacity 0.2s ease",
                        },
                        "& .message-delivery-icon": {
                          opacity: 0,
                          transition: "opacity 0.2s ease",
                        },
                        "&:hover .message-action-bar, &:focus-within .message-action-bar": {
                          opacity: 1,
                          pointerEvents: "auto",
                        },
                        "&:hover .message-delivery-icon, &:focus-within .message-delivery-icon": {
                          opacity: 1,
                        },
                      }}
                    >
                      {chatMode === "group" && !message.isMine && (
                        <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 700, display: "block", mb: 0.3 }}>
                          {message.senderFullName || message.senderUsername}
                        </Typography>
                      )}
                      {message.isDeleted ? (
                        renderDeletedMessageNotice(message)
                      ) : (
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {renderMessageContent(message)}
                        </Typography>
                      )}
                      {!message.isDeleted && message.replyToMessageId && (
                        <Box
                          sx={{
                            mt: 0.6,
                            mb: 0.3,
                            p: 0.8,
                            borderRadius: 1,
                            borderLeft: "3px solid",
                            borderColor: message.isMine ? "rgba(255,255,255,0.75)" : "primary.main",
                            bgcolor: message.isMine ? "rgba(255,255,255,0.14)" : "rgba(37,99,235,0.08)",
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                            {message.replyToSender || t("chatWidget.replyingTo")}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.95 }}>
                            {message.replyToSnippet || ""}
                          </Typography>
                        </Box>
                      )}
                      {!message.isDeleted && message.attachmentName && (
                        <Box sx={{ mt: 0.5 }}>
                          {isImageAttachment(message) && getAttachmentSourceUrl(message) ? (
                            <Box
                              component="img"
                              src={getAttachmentSourceUrl(message)}
                              alt={message.attachmentName}
                              onClick={() =>
                                openMediaPreview(
                                  "image",
                                  getAttachmentSourceUrl(message),
                                  message.attachmentName,
                                  message
                                )
                              }
                              sx={{
                                display: "block",
                                maxWidth: 280,
                                width: "100%",
                                borderRadius: 1.2,
                                mb: 0.5,
                                border: "1px solid",
                                borderColor: message.isMine ? "rgba(255,255,255,0.35)" : "divider",
                                cursor: "zoom-in",
                              }}
                            />
                          ) : null}
                          {isVideoAttachment(message) && getAttachmentSourceUrl(message) ? (
                            <Box
                              component="video"
                              src={getAttachmentSourceUrl(message)}
                              controls
                              preload="metadata"
                              onClick={() =>
                                openMediaPreview(
                                  "video",
                                  getAttachmentSourceUrl(message),
                                  message.attachmentName,
                                  message
                                )
                              }
                              sx={{
                                display: "block",
                                maxWidth: 300,
                                width: "100%",
                                borderRadius: 1.2,
                                mb: 0.5,
                                backgroundColor: "#000",
                                cursor: "zoom-in",
                              }}
                            />
                          ) : null}
                          {isAudioAttachment(message) && getAttachmentSourceUrl(message) ? (
                            <Box
                              component="audio"
                              src={getAttachmentSourceUrl(message)}
                              controls
                              preload="metadata"
                              sx={{
                                display: "block",
                                width: "100%",
                                maxWidth: 320,
                                mb: 0.5,
                              }}
                            />
                          ) : null}
                          <Button
                            size="small"
                            variant={message.isMine ? "outlined" : "text"}
                            startIcon={<FileDownloadIcon />}
                            onClick={() => handleDownloadAttachment(message)}
                            sx={{
                              mt: 0.1,
                              color: message.isMine ? "rgba(255,255,255,0.95)" : "text.primary",
                              borderColor: message.isMine ? "rgba(255,255,255,0.5)" : "divider",
                              textTransform: "none",
                              justifyContent: "flex-start",
                              px: 0.6,
                            }}
                          >
                            {message.attachmentName}
                          </Button>
                        </Box>
                      )}
                      {getReactionRows(message).length > 0 && (
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.55, flexWrap: "wrap" }}>
                          {getReactionRows(message).map((reaction) => (
                            <Chip
                              key={`${message.id}-${reaction.emoji}`}
                              size="small"
                              label={`${reaction.emoji} ${reaction.count}`}
                              onClick={() => toggleReaction(message, reaction.emoji)}
                              variant={reaction.mine ? "filled" : "outlined"}
                              sx={{
                                height: 22,
                                borderRadius: 999,
                                bgcolor: reaction.mine
                                  ? message.isMine
                                    ? "rgba(255,255,255,0.2)"
                                    : "rgba(37,99,235,0.14)"
                                  : undefined,
                              }}
                            />
                          ))}
                        </Stack>
                      )}
                      {Number(reactionPickerMessageId || 0) === Number(message.id) && !message.isDeleted && (
                        <Stack
                          direction="row"
                          spacing={0.4}
                          sx={{
                            mt: 0.55,
                            p: 0.45,
                            borderRadius: 999,
                            width: "fit-content",
                            bgcolor: message.isMine ? "rgba(255,255,255,0.16)" : "rgba(148,163,184,0.15)",
                            border: "1px solid",
                            borderColor: message.isMine ? "rgba(255,255,255,0.26)" : "rgba(148,163,184,0.28)",
                          }}
                        >
                          {QUICK_REACTIONS.map((emoji) => (
                            <Button
                              key={`inline-reaction-${message.id}-${emoji}`}
                              size="small"
                              onClick={() => toggleReaction(message, emoji)}
                              sx={{ minWidth: 0, px: 0.45, py: 0.15, borderRadius: 999, fontSize: 19, lineHeight: 1.1 }}
                            >
                              <span>{emoji}</span>
                            </Button>
                          ))}
                        </Stack>
                      )}
                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end" sx={{ mt: 0.5 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            textAlign: "right",
                            color: message.isMine ? "rgba(255,255,255,0.9)" : "text.secondary",
                          }}
                        >
                          {message.createdAt
                            ? new Date(message.createdAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US")
                            : "-"}
                          {message.editedAt ? ` • ${t("chatWidget.edited")}` : ""}
                        </Typography>
                        <Box className="message-delivery-icon" sx={{ display: "inline-flex", alignItems: "center" }}>
                          {renderDeliveryStateIcon(message, isLatestMine)}
                        </Box>
                        <Stack className="message-action-bar" direction="row" spacing={0.5} alignItems="center">
                        {!message.isDeleted && (
                          <IconButton
                            size="small"
                            onClick={(event) => toggleReactionPicker(event, message)}
                            sx={{ color: message.isMine ? "rgba(255,255,255,0.9)" : "text.secondary", p: 0.2 }}
                          >
                            <AddReactionOutlinedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      {!message.isDeleted && (
                          <IconButton
                            size="small"
                            onClick={() => handleStartReply(message)}
                            sx={{ color: message.isMine ? "rgba(255,255,255,0.9)" : "text.secondary", p: 0.2 }}
                          >
                            <ReplyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        {chatMode === "direct" &&
                          message.isMine &&
                          !message.isDeleted &&
                          Boolean(String(message.content || "").trim()) &&
                          !message.attachmentName && (
                          <IconButton
                            size="small"
                            onClick={() => handleStartEdit(message)}
                            sx={{ color: "rgba(255,255,255,0.9)", p: 0.2 }}
                          >
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        {message.isMine && !message.isDeleted && (
                          <IconButton
                            size="small"
                            onClick={() =>
                              chatMode === "group"
                                ? handleDeleteGroupMessage(selectedGroupId || message.groupId, message.id)
                                : handleDeleteMessage(message.id)
                            }
                            sx={{ color: message.isMine ? "rgba(255,255,255,0.9)" : "text.secondary", p: 0.2 }}
                          >
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                        </Stack>
                      </Stack>
                    </Box>
                    );
                  })}
                </>
              )}
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderTop: "1px solid",
                borderColor: "rgba(148,163,184,0.24)",
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                bgcolor: "rgba(255,255,255,0.94)",
                backdropFilter: "blur(6px)",
                flexShrink: 0,
              }}
            >
              {(recordingVoice || pendingVoiceFile) && (
                <Box
                  sx={{
                    width: "100%",
                    px: 1,
                    py: 0.7,
                    borderRadius: 1.3,
                    border: "1px solid",
                    borderColor: recordingVoice ? "error.light" : "divider",
                    bgcolor: recordingVoice ? "rgba(239,68,68,0.08)" : "background.paper",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.2,
                  }}
                >
                  {recordingVoice ? (
                    <>
                      <Chip
                        size="small"
                        color="error"
                        label={`${t("chatWidget.recordingVoice")} ${recordingVoiceSeconds}s / ${MAX_VOICE_RECORDING_SECONDS}s`}
                      />
                      <Button size="small" color="error" onClick={stopVoiceRecording}>
                        {t("chatWidget.stopRecording")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {t("chatWidget.voiceReadyToSend")}
                      </Typography>
                      {pendingVoiceUrl && (
                        <Box component="audio" src={pendingVoiceUrl} controls preload="metadata" sx={{ height: 32, flex: 1 }} />
                      )}
                      <Button size="small" color="inherit" onClick={cancelPendingVoice}>
                        {t("chatWidget.cancelVoice")}
                      </Button>
                      <Button size="small" variant="contained" onClick={sendPendingVoice} disabled={uploadingAttachment}>
                        {t("chatWidget.sendVoice")}
                      </Button>
                    </>
                  )}
                </Box>
              )}
              {pendingPastedImageFile && (
                <Box
                  sx={{
                    width: "100%",
                    px: 1,
                    py: 0.7,
                    borderRadius: 1.3,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  {pendingPastedImageUrl ? (
                    <Box
                      component="img"
                      src={pendingPastedImageUrl}
                      alt="clipboard-preview"
                      sx={{ width: 52, height: 52, objectFit: "cover", borderRadius: 1, border: "1px solid", borderColor: "divider" }}
                    />
                  ) : null}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                      Ảnh từ clipboard đã sẵn sàng
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      Nhấn nút Gửi để gửi ảnh inline
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      value={pendingPastedImageCaption}
                      onChange={(e) => setPendingPastedImageCaption(e.target.value)}
                      placeholder="Thêm mô tả ảnh (caption)..."
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                  <Button size="small" color="inherit" onClick={clearPendingPastedImage}>
                    {t("common.cancel")}
                  </Button>
                </Box>
              )}
              {replyingTo?.id && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${t("chatWidget.replyingTo")} ${replyingTo.sender || "-"}: ${replyingTo.snippet || ""}`}
                  onDelete={handleCancelReply}
                  sx={{ maxWidth: "100%", mb: 0.2 }}
                />
              )}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleAttachmentSelect}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageSelect}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={handleVideoSelect}
              />
              <IconButton
                onClick={() => imageInputRef.current?.click()}
                disabled={!activeCanSend || uploadingAttachment}
                sx={{ alignSelf: "flex-end" }}
                title={t("chatWidget.sendInlineImage")}
              >
                <ImageOutlinedIcon />
              </IconButton>
              <IconButton
                onClick={() => videoInputRef.current?.click()}
                disabled={!activeCanSend || uploadingAttachment}
                sx={{ alignSelf: "flex-end" }}
                title={t("chatWidget.sendInlineVideo")}
              >
                <SmartDisplayOutlinedIcon />
              </IconButton>
              <IconButton
                onClick={recordingVoice ? stopVoiceRecording : startVoiceRecording}
                disabled={!activeCanSend || uploadingAttachment || Boolean(pendingVoiceFile)}
                color={recordingVoice ? "error" : "default"}
                sx={{ alignSelf: "flex-end" }}
              >
                {recordingVoice ? <StopCircleOutlinedIcon /> : <MicIcon />}
              </IconButton>
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                disabled={chatMode === "group" ? !selectedGroupId || uploadingAttachment : !selectedUsername || uploadingAttachment}
                sx={{ alignSelf: "flex-end" }}
                title={t("chatWidget.attachmentLabel")}
              >
                <AttachFileIcon />
              </IconButton>
              <IconButton
                onClick={(e) => setEmojiAnchorEl(e.currentTarget)}
                disabled={!activeCanSend}
                sx={{ alignSelf: "flex-end" }}
              >
                <InsertEmoticonIcon />
              </IconButton>
              <TextField
                inputRef={composerInputRef}
                size="small"
                fullWidth
                multiline
                minRows={1}
                maxRows={4}
                disabled={!activeCanSend}
                placeholder={t("chatWidget.inputPlaceholder")}
                value={draft}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setDraft(nextValue);
                  refreshMentionState(nextValue, e.target);
                }}
                onPaste={handleComposerPaste}
                onKeyDown={(e) => {
                  if (chatMode === "group" && mentionCandidates.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionActiveIndex((prev) => (prev + 1) % mentionCandidates.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionActiveIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setMentionAnchorEl(null);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      const candidate = mentionCandidates[mentionActiveIndex] || mentionCandidates[0];
                      if (candidate) applyMention(candidate);
                      return;
                    }
                  }
                  if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
                  if (!typingActiveRef.current) sendTyping(true);
                  typingStopTimerRef.current = setTimeout(() => sendTyping(false), 1200);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              {chatMode === "direct" && editingMessageId !== null && (
                <Button variant="text" color="inherit" onClick={handleCancelEdit}>
                  {t("chatWidget.cancelEdit")}
                </Button>
              )}
              <Button
                variant="contained"
                disabled={(!draft.trim() && !pendingPastedImageFile) || !activeCanSend || sending}
                onClick={handleSend}
              >
                {sending
                  ? t("chatWidget.sending")
                  : editingMessageId !== null
                    ? t("chatWidget.saveEdit")
                    : t("chatWidget.send")}
              </Button>
            </Box>
            {chatMode === "group" && selectedGroup && (
              <Box sx={{ px: 1.5, pb: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {(selectedGroup.members || [])
                  .filter((member) => member.username !== currentUser?.username)
                  .slice(0, 8)
                  .map((member) => (
                    <Chip
                      key={member.username}
                      size="small"
                      label={`@${member.fullName || member.username}`}
                      onClick={() =>
                        setDraft((prev) =>
                          `${String(prev || "").trim()} @{${String(member.fullName || member.username).trim()}} `.trimStart()
                        )
                      }
                    />
                  ))}
              </Box>
            )}
            <Menu
              anchorEl={conversationMenuAnchorEl}
              open={Boolean(conversationMenuAnchorEl)}
              onClose={closeConversationMenu}
              slotProps={{ paper: { sx: { zIndex: 2602 } } }}
              sx={{ zIndex: 2602 }}
            >
              {conversationMenuTarget?.type === "direct" &&
                Number(conversationMenuTarget?.unreadCount || 0) > 0 && (
                <MenuItem
                  onClick={() => {
                    const username = conversationMenuTarget?.username;
                    closeConversationMenu();
                    markDirectConversationRead(username);
                  }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <DoneAllIcon sx={{ fontSize: 17 }} />
                    {t("chatWidget.markAsReadAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "direct" && (
                <MenuItem
                  onClick={() => {
                    const username = conversationMenuTarget?.username;
                    closeConversationMenu();
                    toggleMutedDirect(username);
                  }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <NotificationsOffOutlinedIcon sx={{ fontSize: 17 }} />
                    {conversationMenuTarget?.muted
                      ? t("chatWidget.unmuteConversationAction")
                      : t("chatWidget.muteConversationAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "direct" && (
                <MenuItem
                  onClick={() => {
                    const username = conversationMenuTarget?.username;
                    const name = conversationMenuTarget?.name;
                    closeConversationMenu();
                    deleteDirectConversation(username, name);
                  }}
                  sx={{ color: "error.main" }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <DeleteIcon sx={{ fontSize: 17 }} />
                    {t("chatWidget.deleteConversationAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "group" && (
                <MenuItem
                  onClick={() => {
                    const groupId = Number(conversationMenuTarget?.groupId || 0);
                    closeConversationMenu();
                    if (!groupId) return;
                    toggleMutedGroup(groupId);
                  }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <NotificationsOffOutlinedIcon sx={{ fontSize: 17 }} />
                    {conversationMenuTarget?.muted
                      ? t("chatWidget.unmuteConversationAction")
                      : t("chatWidget.muteConversationAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "group" && (
                <MenuItem
                  onClick={() => {
                    const groupId = Number(conversationMenuTarget?.groupId || 0);
                    closeConversationMenu();
                    if (!groupId) return;
                    togglePinnedGroup(groupId);
                  }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <PushPinIcon sx={{ fontSize: 17 }} />
                    {pinnedGroupIds.includes(Number(conversationMenuTarget?.groupId || 0))
                      ? t("chatWidget.unpinConversationAction")
                      : t("chatWidget.pinConversationAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "group" &&
                Boolean(conversationMenuTarget?.canManageGroup) && (
                <MenuItem
                  onClick={() => {
                    const groupId = Number(conversationMenuTarget?.groupId || 0);
                    closeConversationMenu();
                    if (!groupId) return;
                    openGroupSettings(groupId);
                  }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <SettingsIcon sx={{ fontSize: 17 }} />
                    {t("chatWidget.groupSettingsAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "group" &&
                (Number(conversationMenuTarget?.unreadCount || 0) > 0 ||
                  Number(conversationMenuTarget?.mentionUnreadCount || 0) > 0) && (
                <MenuItem
                  onClick={() => {
                    const groupId = conversationMenuTarget?.groupId;
                    closeConversationMenu();
                    markGroupConversationRead(groupId);
                  }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <DoneAllIcon sx={{ fontSize: 17 }} />
                    {t("chatWidget.markAsReadAction")}
                  </Box>
                </MenuItem>
              )}
              {conversationMenuTarget?.type === "group" &&
                Boolean(conversationMenuTarget?.canDeleteGroup) && (
                <MenuItem
                  onClick={() => {
                    const groupId = conversationMenuTarget?.groupId;
                    const name = conversationMenuTarget?.name;
                    closeConversationMenu();
                    deleteGroupConversation(groupId, name);
                  }}
                  sx={{ color: "error.main" }}
                >
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <DeleteIcon sx={{ fontSize: 17 }} />
                    {t("chatWidget.groupDeleteAction")}
                  </Box>
                </MenuItem>
              )}
            </Menu>
            <Menu
              anchorEl={statusMenuAnchorEl}
              open={Boolean(statusMenuAnchorEl)}
              onClose={() => setStatusMenuAnchorEl(null)}
              slotProps={{ paper: { sx: { zIndex: 2602 } } }}
              sx={{ zIndex: 2602 }}
            >
              {[
                { id: "AVAILABLE", label: t("chatWidget.statusOnline"), color: "success.main" },
                { id: "BUSY", label: t("chatWidget.statusBusy"), color: "error.main" },
                { id: "AWAY", label: t("chatWidget.statusAway"), color: "warning.main" },
                { id: "DND", label: t("chatWidget.statusDnd"), color: "secondary.main" },
                { id: "INVISIBLE", label: t("chatWidget.statusInvisible"), color: "text.disabled" },
              ].map((item) => (
                <MenuItem
                  key={item.id}
                  selected={String(myChatStatus || "").toUpperCase() === item.id}
                  onClick={() => applyMyStatus(item.id)}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <FiberManualRecordIcon sx={{ fontSize: 11, color: item.color }} />
                    <Typography variant="body2">{item.label}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
            <Menu
              anchorEl={mentionAnchorEl}
              open={Boolean(mentionAnchorEl) && mentionCandidates.length > 0}
              onClose={() => setMentionAnchorEl(null)}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "left" }}
              slotProps={{
                paper: {
                  sx: {
                    zIndex: 2601,
                    maxHeight: 260,
                    minWidth: 220,
                  },
                },
              }}
              sx={{ zIndex: 2601 }}
            >
              {mentionCandidates.map((item, idx) => (
                <MenuItem
                  key={item.username}
                  selected={idx === mentionActiveIndex}
                  onMouseEnter={() => setMentionActiveIndex(idx)}
                  onClick={() => applyMention(item)}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Avatar src={item.avatarUrl || undefined} sx={{ width: 22, height: 22 }}>
                      {String(item.fullName || item.username || "U").slice(0, 1).toUpperCase()}
                    </Avatar>
                    <Typography variant="body2">
                      @{item.fullName || item.username}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
            <Dialog
              open={Boolean(deleteConfirmDialog.open)}
              onClose={closeDeleteConfirmDialog}
              fullWidth
              maxWidth="xs"
              sx={{ zIndex: 2701 }}
            >
              <DialogTitle sx={{ fontWeight: 800 }}>
                {deleteConfirmDialog.type === "group"
                  ? t("chatWidget.groupDeleteAction")
                  : t("chatWidget.deleteConversationAction")}
              </DialogTitle>
              <DialogContent>
                <Typography variant="body2" color="text.secondary">
                  {deleteConfirmDialog.type === "group"
                    ? t("chatWidget.deleteGroupConfirm", { name: deleteConfirmDialog.name || "#" })
                    : t("chatWidget.deleteConversationConfirm", { name: deleteConfirmDialog.name || "" })}
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={closeDeleteConfirmDialog}>{t("common.cancel")}</Button>
                <Button color="error" variant="contained" onClick={handleConfirmDeleteConversation}>
                  {t("common.confirm")}
                </Button>
              </DialogActions>
            </Dialog>
            <Menu
              anchorEl={emojiAnchorEl}
              open={Boolean(emojiAnchorEl)}
              onClose={() => setEmojiAnchorEl(null)}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "left" }}
              slotProps={{
                paper: {
                  sx: {
                    zIndex: 2600,
                  },
                },
              }}
              sx={{ zIndex: 2600 }}
            >
              <MenuItem disabled sx={{ opacity: 0.75 }}>
                {t("chatWidget.pickEmoji")}
              </MenuItem>
              <Box sx={{ px: 1, pb: 1, display: "grid", gridTemplateColumns: "repeat(5, 36px)", gap: 0.5 }}>
                {QUICK_EMOJIS.map((emoji) => (
                  <IconButton
                    key={emoji}
                    size="small"
                    onClick={() => insertEmoji(emoji)}
                    sx={{ fontSize: 19, width: 32, height: 32 }}
                  >
                    {emoji}
                  </IconButton>
                ))}
              </Box>
            </Menu>
            <Dialog
              open={Boolean(mediaPreview.open)}
              onClose={closeMediaPreview}
              maxWidth="lg"
              fullWidth
              sx={{ zIndex: 2700 }}
            >
              <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="subtitle2" noWrap>
                  {mediaPreview.name || t("chatWidget.attachmentLabel")}
                </Typography>
              </DialogTitle>
              <DialogContent sx={{ pt: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
                {mediaPreview.type === "image" ? (
                  <Box
                    component="img"
                    src={mediaPreview.src}
                    alt={mediaPreview.name || "preview"}
                    sx={{
                      maxWidth: "100%",
                      maxHeight: "78vh",
                      borderRadius: 1,
                    }}
                  />
                ) : mediaPreview.type === "video" ? (
                  <Box
                    component="video"
                    src={mediaPreview.src}
                    controls
                    autoPlay
                    preload="metadata"
                    sx={{
                      width: "100%",
                      maxHeight: "78vh",
                      borderRadius: 1,
                      backgroundColor: "#000",
                    }}
                  />
                ) : null}
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() =>
                    mediaPreview.message
                      ? handleDownloadAttachment(mediaPreview.message, {
                          mode: mediaPreview.mode,
                          groupId: mediaPreview.groupId,
                        })
                      : null
                  }
                  disabled={!mediaPreview.message}
                  startIcon={<FileDownloadIcon />}
                >
                  {t("common.download")}
                </Button>
                <Button onClick={closeMediaPreview}>{t("common.close")}</Button>
              </DialogActions>
            </Dialog>
            <Dialog
              open={groupDialogOpen}
              onClose={() => !creatingGroup && setGroupDialogOpen(false)}
              fullWidth
              maxWidth="sm"
              sx={{ zIndex: 2600 }}
              PaperProps={{
                sx: {
                  borderRadius: 3,
                  overflow: "hidden",
                },
              }}
            >
              <DialogTitle
                sx={{
                  pb: 0.5,
                  pt: 2,
                  fontWeight: 800,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                {t("chatWidget.createGroup")}
              </DialogTitle>
              <DialogContent sx={{ display: "grid", gap: 1.2, pt: "18px !important", pb: 1 }}>
                <TextField
                  autoFocus
                  size="small"
                  label={t("chatWidget.groupNameLabel")}
                  placeholder={t("chatWidget.groupNamePlaceholder")}
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  size="small"
                  label={t("chatWidget.groupMemberSearchLabel")}
                  placeholder={t("chatWidget.searchUsersPlaceholder")}
                  value={groupMemberSearch}
                  onChange={(e) => {
                    setGroupMemberSearch(e.target.value);
                    if (String(e.target.value || "").trim()) {
                      setGroupShowFullDirectory(false);
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                />
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    {groupMemberSearch.trim()
                      ? t("chatWidget.groupSearchResults", { count: visibleGroupCandidates.length })
                      : t("chatWidget.groupSuggestedMembers")}
                  </Typography>
                  {!groupMemberSearch.trim() && (
                    <Button
                      size="small"
                      onClick={() => setGroupShowFullDirectory((prev) => !prev)}
                      sx={{ textTransform: "none" }}
                    >
                      {groupShowFullDirectory
                        ? t("chatWidget.groupShowSuggested")
                        : t("chatWidget.groupShowAllMembers", { count: selectableUsers.length })}
                    </Button>
                  )}
                </Box>
                <Box
                  sx={{
                    maxHeight: 260,
                    overflowY: "auto",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    p: 1,
                    bgcolor: "grey.50",
                  }}
                >
                  <Stack spacing={0.8}>
                    {visibleGroupCandidates.map((item) => {
                      const selected = groupMemberUsernames.includes(item.username);
                      return (
                        <Button
                          key={item.username}
                          onClick={() => toggleGroupMember(item.username)}
                          sx={{
                            justifyContent: "space-between",
                            textTransform: "none",
                            borderRadius: 1.2,
                            bgcolor: selected ? "action.selected" : "transparent",
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Avatar src={item.avatarUrl || undefined} sx={{ width: 26, height: 26 }}>
                              {String(item.fullName || item.username || "U").slice(0, 1).toUpperCase()}
                            </Avatar>
                            <Typography variant="body2">
                              {item.fullName || item.username}
                            </Typography>
                          </Box>
                          {selected && <Chip size="small" color="primary" label="✓" />}
                        </Button>
                      );
                    })}
                    {visibleGroupCandidates.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                        {t("chatWidget.noUsersFound")}
                      </Typography>
                    )}
                  </Stack>
                </Box>
                {!!groupMemberUsernames.length && (
                  <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap" }}>
                    {groupMemberUsernames.map((username) => {
                      const member = selectableUsers.find((item) => item.username === username);
                      return (
                        <Chip
                          key={username}
                          size="small"
                          label={member?.fullName || member?.username || username}
                          onDelete={() => toggleGroupMember(username)}
                        />
                      );
                    })}
                  </Box>
                )}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2, pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
                <Button onClick={() => setGroupDialogOpen(false)} disabled={creatingGroup}>
                  {t("common.cancel")}
                </Button>
                <Button variant="contained" onClick={createGroupChat} disabled={creatingGroup}>
                  {creatingGroup ? t("chatWidget.sending") : t("chatWidget.createGroup")}
                </Button>
              </DialogActions>
            </Dialog>
            <Dialog
              open={groupSettingsOpen}
              onClose={() => !groupManaging && setGroupSettingsOpen(false)}
              fullWidth
              maxWidth="sm"
              sx={{ zIndex: 2600 }}
            >
              <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>{t("chatWidget.groupSettingsTitle")}</DialogTitle>
              <DialogContent sx={{ display: "grid", gap: 1.4, pt: 1.5, pb: 1, maxHeight: "70vh" }}>
                {canManageSelectedGroup && (
                  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2, display: "grid", gap: 1 }}>
                    <TextField
                      size="small"
                      label={t("chatWidget.groupNameLabel")}
                      value={groupRenameDraft}
                      onChange={(e) => setGroupRenameDraft(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Button variant="outlined" onClick={renameGroup} disabled={groupManaging} sx={{ borderRadius: 1.5 }}>
                      {t("chatWidget.groupRenameAction")}
                    </Button>
                  </Box>
                )}
                {canManageSelectedGroup && (
                  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2, display: "grid", gap: 1 }}>
                    <Autocomplete
                      multiple
                      disablePortal
                      disableCloseOnSelect
                      filterSelectedOptions
                      options={groupAddMemberOptions}
                      inputValue={groupAddMemberQuery}
                      onInputChange={(_event, value, reason) => {
                        // MUI may emit "reset" during internal value sync; keep user typing stable.
                        if (reason === "reset") return;
                        setGroupAddMemberQuery(String(value || ""));
                      }}
                      filterOptions={(options, state) => {
                        const q = String(state.inputValue || "")
                          .toLowerCase()
                          .trim();
                        if (!q) return [];
                        return options.filter((item) => {
                          const fullName = String(item?.fullName || "").toLowerCase();
                          const username = String(item?.username || "").toLowerCase();
                          return fullName.includes(q) || username.includes(q);
                        });
                      }}
                      value={groupAddMemberOptions.filter((item) =>
                        groupAddMemberSelections.includes(String(item.username || ""))
                      )}
                      getOptionLabel={(option) => String(option?.fullName || option?.username || "")}
                      onChange={(_event, selected) =>
                        setGroupAddMemberSelections(
                          selected
                            .map((item) => String(item.username || ""))
                            .filter((username) => username && !existingGroupMemberUsernames.has(username.toLowerCase()))
                        )
                      }
                      getOptionDisabled={(option) =>
                        existingGroupMemberUsernames.has(String(option?.username || "").toLowerCase())
                      }
                      slotProps={{
                        popper: { sx: { zIndex: 1800 } },
                        paper: { sx: { mt: 0.5, border: "1px solid", borderColor: "divider" } },
                      }}
                      ListboxProps={{ style: { maxHeight: 280, overflowY: "auto" } }}
                      noOptionsText={t("chatWidget.noMatchingUsers")}
                      renderOption={(props, option, { selected }) => {
                        const { key, ...optionProps } = props;
                        return (
                        <Box key={key} component="li" {...optionProps} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Checkbox
                            checked={selected}
                            icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                            checkedIcon={<CheckBoxIcon fontSize="small" />}
                            sx={{ p: 0.25 }}
                          />
                          <Avatar src={option.avatarUrl || undefined} sx={{ width: 24, height: 24 }}>
                            {String(option.fullName || option.username || "U").slice(0, 1).toUpperCase()}
                          </Avatar>
                          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }}>
                            {option.fullName || option.username}
                          </Typography>
                          {existingGroupMemberUsernames.has(String(option.username || "").toLowerCase()) ? (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                              ({t("chatWidget.alreadyMember")})
                            </Typography>
                          ) : null}
                        </Box>
                      );
                      }}
                      renderInput={(params) => {
                        const safeInputProps = params?.InputProps || {};
                        return (
                          <TextField
                            {...params}
                            size="small"
                            label={t("chatWidget.groupAddMemberLabel")}
                            placeholder="Tìm kiếm"
                            InputLabelProps={{ shrink: true }}
                            InputProps={{
                              ...safeInputProps,
                              startAdornment: (
                                <>
                                  <InputAdornment position="start">
                                    <SearchIcon fontSize="small" color="action" />
                                  </InputAdornment>
                                  {safeInputProps.startAdornment || null}
                                </>
                              ),
                              endAdornment: (
                                <>
                                  {groupAddMemberQuery.trim() ? (
                                    <IconButton
                                      size="small"
                                      onClick={() => setGroupAddMemberQuery("")}
                                      sx={{
                                        width: 22,
                                        height: 22,
                                        bgcolor: "rgba(0,0,0,0.08)",
                                        "&:hover": { bgcolor: "rgba(0,0,0,0.16)" },
                                        mr: 0.5,
                                      }}
                                    >
                                      <CloseIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  ) : null}
                                  {safeInputProps.endAdornment || null}
                                </>
                              ),
                            }}
                          />
                        );
                      }}
                    />
                    <Button variant="outlined" onClick={addGroupMember} disabled={groupManaging} sx={{ borderRadius: 1.5 }}>
                      {t("chatWidget.groupAddMemberAction")}
                    </Button>
                  </Box>
                )}
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    {t("chatWidget.members")}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      px: 0.9,
                      py: 0.2,
                      borderRadius: 999,
                      bgcolor: "action.hover",
                      fontWeight: 700,
                      lineHeight: 1.6,
                      minWidth: 24,
                      textAlign: "center",
                    }}
                  >
                    {(selectedGroup?.members || []).length}
                  </Typography>
                </Stack>
                <TextField
                  size="small"
                  value={groupMembersQuery}
                  onChange={(event) => setGroupMembersQuery(event.target.value)}
                  placeholder={t("chatWidget.memberQuickSearchPlaceholder")}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: groupMembersQuery.trim() ? (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => setGroupMembersQuery("")}
                            sx={{
                              width: 22,
                              height: 22,
                              bgcolor: "rgba(0,0,0,0.08)",
                              "&:hover": { bgcolor: "rgba(0,0,0,0.16)" },
                            }}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </InputAdornment>
                      ) : null,
                    },
                  }}
                />
                <Box
                  sx={{
                    display: "grid",
                    gap: 0.6,
                    maxHeight: { xs: 220, sm: 280 },
                    overflowY: "auto",
                    pr: 0.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1.5,
                    p: 0.7,
                    bgcolor: "background.default",
                    "&::-webkit-scrollbar": { width: 8 },
                    "&::-webkit-scrollbar-thumb": {
                      bgcolor: "rgba(0,0,0,0.25)",
                      borderRadius: 999,
                    },
                    "&::-webkit-scrollbar-thumb:hover": { bgcolor: "rgba(0,0,0,0.35)" },
                  }}
                >
                  {visibleGroupMembers.map((member) => (
                    <Box
                      key={member.username}
                      sx={{
                        "--roleBg":
                          Number(member.id) === Number(selectedGroup?.ownerId)
                            ? "rgba(37,99,235,0.08)"
                            : member.isAdmin
                              ? "rgba(147,51,234,0.08)"
                              : "transparent",
                        position: "relative",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1.5,
                        bgcolor: "var(--roleBg)",
                        py: 0.7,
                        px: 0.8,
                        display: "flex",
                        alignItems: "center",
                        minHeight: 44,
                        transition: "background-color .16s ease, border-color .16s ease",
                        mb: 0.55,
                        "& .member-actions": {
                          opacity: 0,
                          pointerEvents: "none",
                          transition: "opacity 0.16s ease",
                        },
                        "&:hover .member-actions, &:focus-within .member-actions": {
                          opacity: 1,
                          pointerEvents: "auto",
                        },
                        "&:hover": {
                          borderColor: "primary.light",
                          bgcolor:
                            Number(member.id) === Number(selectedGroup?.ownerId)
                              ? "rgba(37,99,235,0.12)"
                              : member.isAdmin
                                ? "rgba(147,51,234,0.12)"
                                : "action.hover",
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={0.8} sx={{ maxWidth: "62%" }}>
                        {Number(member.id) === Number(selectedGroup?.ownerId) ? (
                          <Tooltip
                            title={t("chatWidget.ownerRoleTooltip")}
                            arrow
                            placement="top"
                            enterDelay={0}
                            slotProps={{ popper: { sx: { zIndex: 2000 } } }}
                          >
                            <IconButton size="small" disableRipple sx={{ p: 0.2, cursor: "default" }}>
                              <StarBorderIcon color="primary" sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        ) : member.isAdmin ? (
                          <Tooltip
                            title={t("chatWidget.adminRoleTooltip")}
                            arrow
                            placement="top"
                            enterDelay={0}
                            slotProps={{ popper: { sx: { zIndex: 2000 } } }}
                          >
                            <IconButton size="small" disableRipple sx={{ p: 0.2, cursor: "default" }}>
                              <ShieldOutlinedIcon color="secondary" sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        <Chip
                          color={Number(member.id) === Number(selectedGroup?.ownerId) ? "primary" : member.isAdmin ? "secondary" : "default"}
                          label={member.fullName || member.username}
                          sx={{ maxWidth: "100%" }}
                        />
                      </Stack>
                      <Stack
                        className="member-actions"
                        direction="row"
                        spacing={0.6}
                        justifyContent="flex-end"
                        sx={{
                          position: "absolute",
                          right: 2,
                          top: "50%",
                          transform: "translateY(-50%)",
                          bgcolor: "rgba(255,255,255,0.94)",
                          px: 0.35,
                          borderRadius: 999,
                          boxShadow: "0 2px 10px rgba(15,23,42,0.10)",
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        {canManageSelectedGroup &&
                          Number(member.id) !== Number(selectedGroup?.ownerId) &&
                          member.username !== currentUser?.username && (
                            <>
                              {!member.isAdmin ? (
                                <Tooltip
                                  title={t("chatWidget.promoteAdminAction")}
                                  arrow
                                  placement="top"
                                  enterDelay={0}
                                  slotProps={{ popper: { sx: { zIndex: 2000 } } }}
                                >
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => promoteGroupAdmin(member.username)}
                                      disabled={groupManaging}
                                      title={t("chatWidget.promoteAdminAction")}
                                    >
                                      <ManageAccountsIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              ) : (
                                <Tooltip
                                  title={t("chatWidget.demoteAdminAction")}
                                  arrow
                                  placement="top"
                                  enterDelay={0}
                                  slotProps={{ popper: { sx: { zIndex: 2000 } } }}
                                >
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="warning"
                                      onClick={() => demoteGroupAdmin(member.username)}
                                      disabled={groupManaging}
                                      title={t("chatWidget.demoteAdminAction")}
                                    >
                                      <ShieldOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}
                            </>
                          )}
                        {canTransferSelectedGroupOwner &&
                          Number(member.id) !== Number(selectedGroup?.ownerId) &&
                          member.username !== currentUser?.username && (
                            <Tooltip
                              title={t("chatWidget.transferOwnerAction")}
                              arrow
                              placement="top"
                              enterDelay={0}
                              slotProps={{ popper: { sx: { zIndex: 2000 } } }}
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => transferGroupOwner(member.username)}
                                  disabled={groupManaging}
                                  title={t("chatWidget.transferOwnerAction")}
                                >
                                  <SwapHorizIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        {canManageSelectedGroup &&
                          Number(member.id) !== Number(selectedGroup?.ownerId) &&
                          member.username !== currentUser?.username && (
                            <Tooltip
                              title={t("common.delete")}
                              arrow
                              placement="top"
                              enterDelay={0}
                              slotProps={{ popper: { sx: { zIndex: 2000 } } }}
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => removeGroupMember(member.username)}
                                  disabled={groupManaging}
                                  title={t("common.delete")}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                      </Stack>
                    </Box>
                  ))}
                </Box>
              </DialogContent>
              <DialogActions sx={{ borderTop: "1px solid", borderColor: "divider", px: 2, py: 1.2 }}>
                <Button onClick={leaveGroup} disabled={groupManaging}>
                  {t("chatWidget.groupLeaveAction")}
                </Button>
                {canDeleteSelectedGroup && (
                  <Button color="error" onClick={deleteGroup} disabled={groupManaging}>
                    {t("chatWidget.groupDeleteAction")}
                  </Button>
                )}
                <Button onClick={() => setGroupSettingsOpen(false)} disabled={groupManaging}>
                  {t("common.close")}
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
          </Paper>
        </Portal>
      )}
    </>
  );
}
