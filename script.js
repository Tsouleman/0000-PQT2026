/* =========================
   CONFIG SUPABASE (TES VALEURS)
   ========================= */
const SUPABASE_URL = "https://ikdizsnzfbhuwgkoucvp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrZGl6c256ZmJodXdna291Y3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzI0NjQsImV4cCI6MjA5MTc0ODQ2NH0.JtIkQmdFXrph-rTab--CqpiP8LAC7FiyNi1OMpUaWgk";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   UI REFS
   ========================= */
const loginDiv = document.getElementById("login");
const chatApp = document.getElementById("chatApp");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const displayNameInput = document.getElementById("displayName");
const accessCodeInput = document.getElementById("accessCode");

const themeBtn = document.getElementById("themeBtn");
const clearBtn = document.getElementById("clearBtn");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const peerNameEl = document.getElementById("peerName");
const peerStatusEl = document.getElementById("peerStatus");

const chatEl = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const imageInput = document.getElementById("imageInput");
const sendBtn = document.getElementById("sendBtn");

// (Optionnels si présents dans ton HTML)
const cameraBtn = document.getElementById("cameraBtn");
const galleryBtn = document.getElementById("galleryBtn");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

const replyPreview = document.getElementById("replyPreview");
const replyText = document.getElementById("replyText");
const cancelReply = document.getElementById("cancelReply");

/* =========================
   STATE
   ========================= */
let roomId = null;
let myUserId = null;
let membersCache = new Map();
let peerUserId = null;

let oldestLoaded = null;
let pagingDone = false;

let replyToId = null;
let typingTimer = null;
let presenceTimer = null;
let ticksPollTimer = null;
let realtimeChannel = null;

let readDebounce = null;

/* =========================
   THEME
   ========================= */
(function initTheme(){
  const saved = localStorage.getItem("theme");
  if(saved === "dark"){
    document.body.classList.add("dark");
    if (themeBtn) themeBtn.textContent = "☀️";
  }
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      document.body.classList.toggle("dark");
      const isDark = document.body.classList.contains("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      themeBtn.textContent = isDark ? "☀️" : "🌙";
    });
  }
})();

/* =========================
   HELPERS
   ========================= */
function esc(str=""){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[s]));
}

function formatTime(ts){
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2,"0");
  const m = String(d.getMinutes()).padStart(2,"0");
  return `${h}:${m}`;
}


SeenFR(ts) {
  const d = new Date(ts);
  const now = new Date();

  // compare les jours en "minuit"
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;

  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  if (day === today) return `en ligne à ${hhmm}`;
  if (day === yesterday) return `en ligne hier à ${hhmm}`;

  // Au-delà d'hier : WhatsApp-like (date + heure)
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `en ligne le ${dd}/${mm} à ${hhmm}`;
}

function isNearBottom(el, px = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < px;
}

/* =========================
   READ RECEIPTS (ticks)
   ========================= */
async function markAsRead() {
  if (!roomId || !myUserId) return;

  // Anti-spam : 1 update max / seconde
  if (readDebounce) return;
  readDebounce = setTimeout(() => (readDebounce = null), 1000);

  const { error } = await sb.from("room_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", myUserId);

  if (error) console.error("markAsRead error", error);
}

function refreshTicksUI() {
  const peer = peerUserId ? membersCache.get(peerUserId) : null;
  if (!peer) return;

  document.querySelectorAll(".message.mine").forEach(el => {
    const createdAt = el.dataset.createdAt;
    const tickSpan = el.querySelector("[data-ticks]");
    if (!createdAt || !tickSpan) return;

    const msgTime = new Date(createdAt).getTime();
    let ticks = "✓";
    let cls = "ticks ticks-sent";

    if (peer.last_seen_at && new Date(peer.last_seen_at).getTime() >= msgTime) {
      ticks = "✓✓";
      cls = "ticks ticks-delivered";
    }
    if (peer.last_read_at && new Date(peer.last_read_at).getTime() >= msgTime) {
      ticks = "✓✓";
      cls = "ticks ticks-read";
    }

    tickSpan.textContent = ticks;
    tickSpan.className = cls;
  });
}

/* =========================
   REPLY
   ========================= */
function setReply(msg){
  replyToId = msg.id;
  const author = membersCache.get(msg.user_id)?.display_name || "…";
  const snippet = (msg.text || (msg.image_path ? "[image]" : "") || "").slice(0,80);
  replyText.textContent = `${author} : ${snippet}`;
  replyPreview.style.display = "flex";
}
function clearReply(){
  replyToId = null;
  replyPreview.style.display = "none";
}
if (cancelReply) cancelReply.addEventListener("click", clearReply);

/* =========================
   INPUT BEHAVIOR
   ========================= */
if (messageInput) {
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = messageInput.scrollHeight + "px";
    setTyping(true);
  });

  messageInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });
}

if (chatEl) {
  chatEl.addEventListener("scroll", () => {
    if (isNearBottom(chatEl)) markAsRead();
  });
}

/* =========================
   LOGIN
   ========================= */
if (loginBtn) loginBtn.addEventListener("click", login);

async function login(){
  loginError.textContent = "";
  const code = accessCodeInput.value.trim();
  const name = displayNameInput.value.trim();

  if(!code || !name){
    loginError.textContent = "Merci de renseigner votre nom et votre code.";
    return;
  }

  try{
    const { data: sess } = await sb.auth.getSession();
    let user = sess?.session?.user;

    if(!user){
      const { data: authData, error: authErr } = await sb.auth.signInAnonymously();
      if(authErr) throw authErr;
      user = authData.user;
    }

    myUserId = user.id;

    const { data, error } = await sb.rpc("join_room_with_code", {
      p_code: code,
      p_display_name: name
    });

    if(error) throw error;
    if(!data || !data.length) throw new Error("Réponse RPC vide");

    roomId = data[0].room_id;

    loginDiv.style.display = "none";
    chatApp.style.display = "flex";

    await refreshMembers();
    startTicksPolling();
    subscribeRealtime();
    await loadInitialMessages();

    if (isNearBottom(chatEl)) markAsRead();
    startPresenceLoop();

  } catch(err){
    console.error(err);
    loginError.textContent = "Connexion impossible. Vérifie le code et que le SQL Supabase est bien installé (RPC + tables).";
  }
}

/* =========================
   MEMBERS / PRESENCE / TYPING
   ========================= */
async function refreshMembers(){
  const { data, error } = await sb
    .from("room_members")
    .select("user_id, display_name, last_seen_at, is_typing, typing_updated_at, last_read_at")
    .eq("room_id", roomId);

  if(error){
    console.error(error);
    return;
  }

  membersCache.clear();
  data.forEach(m => membersCache.set(m.user_id, m));

  const peer = data.find(m => m.user_id !== myUserId);
  peerUserId = peer?.user_id || null;

  peerNameEl.textContent = peer?.display_name || "En attente…";
  updatePeerStatus();
}

function updatePeerStatus(){
  if(!peerUserId){
    peerStatusEl.textContent = "En attente de l’autre personne…";
    return;
  }
  const peer = membersCache.get(peerUserId);
  if(!peer){
    peerStatusEl.textContent = "…";
    return;
  }

  const now = Date.now();
  const lastSeen = new Date(peer.last_seen_at).getTime();
  const online = (now - lastSeen) < 45000;

  const typingFresh = peer.is_typing && peer.typing_updated_at
    && (now - new Date(peer.typing_updated_at).getTime()) < 5000;

  if(typingFresh) peerStatusEl.textContent = "en train d’écrire…";
  else if(online) peerStatusEl.textContent = "en ligne";
  else peerStatusEl.textContent = formatLastSeenFR(peer.last_seen_at);
}

async function setTyping(flag){
  if(!roomId || !myUserId) return;

  if(flag){
    await sb.from("room_members")
      .update({ is_typing:true, typing_updated_at:new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", myUserId);

    if(typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(async () => {
      await sb.from("room_members")
        .update({ is_typing:false, typing_updated_at:new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", myUserId);
    }, 2000);
  }
}

function startPresenceLoop(){
  const ping = async () => {
    if(!roomId || !myUserId) return;

    const { error } = await sb.from("room_members")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", myUserId);

    if (error) console.error("presence ping error", error);
  };

  ping();
  presenceTimer = setInterval(ping, 25000);

  document.addEventListener("visibilitychange", () => {
    if(!document.hidden) ping();
  });

  // iOS-friendly
  window.addEventListener("pageshow", ping);
  window.addEventListener("focus", ping);
  window.addEventListener("touchstart", () => ping(), { passive: true });
}

function startTicksPolling(){
  if(ticksPollTimer) clearInterval(ticksPollTimer);
  ticksPollTimer = setInterval(async () => {
    await refreshMembers();
    refreshTicksUI();
  }, 3000);
}

/* =========================
   PAGINATION
   ========================= */
if (loadMoreBtn) loadMoreBtn.addEventListener("click", () => loadMoreMessages(false));

async function loadInitialMessages(){
  chatEl.innerHTML = "";
  oldestLoaded = null;
  pagingDone = false;
  await loadMoreMessages(true);
}

async function loadMoreMessages(scrollBottom){
  if(pagingDone) return;

  const prevHeight = chatEl.scrollHeight;
  const prevTop = chatEl.scrollTop;

  let q = sb.from("messages")
    .select("id, room_id, user_id, text, image_path, reply_to, created_at, deleted_at, reply:reply_to(id, user_id, text, image_path, created_at)")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending:false })
    .limit(30);

  if(oldestLoaded) q = q.lt("created_at", oldestLoaded);

  const { data, error } = await q;
  if(error){
    console.error(error);
    return;
  }

  if(!data || data.length === 0){
    pagingDone = true;
    loadMoreBtn.style.display = "none";
    return;
  }

  oldestLoaded = data[data.length - 1].created_at;
  loadMoreBtn.style.display = "block";

  await refreshMembers();

  const asc = [...data].reverse();
  const frag = document.createDocumentFragment();

  for(const msg of asc){
    frag.appendChild(await buildMessageNode(msg));
  }

  chatEl.prepend(frag);

  const newHeight = chatEl.scrollHeight;
  chatEl.scrollTop = prevTop + (newHeight - prevHeight);
  if(scrollBottom) chatEl.scrollTop = chatEl.scrollHeight;
}

/* =========================
   REALTIME
   ========================= */
function subscribeRealtime(){
  if(realtimeChannel){
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = sb.channel("room-" + roomId);

  realtimeChannel
    .on("postgres_changes", {
      event:"INSERT",
      schema:"public",
      table:"messages",
      filter:`room_id=eq.${roomId}`
    }, async (payload) => {
      const { data } = await sb.from("messages")
        .select("id, room_id, user_id, text, image_path, reply_to, created_at, deleted_at, reply:reply_to(id, user_id, text, image_path, created_at)")
        .eq("id", payload.new.id)
        .single();

      if(!data || data.deleted_at) return;

      await refreshMembers();
      chatEl.appendChild(await buildMessageNode(data));
      chatEl.scrollTop = chatEl.scrollHeight;
      markAsRead();
    })
    .on("postgres_changes", {
      event:"DELETE",
      schema:"public",
      table:"messages",
      filter:`room_id=eq.${roomId}`
    }, (payload) => {
      const deletedId = payload.old?.id;
      if (!deletedId) return;
      const el = chatEl.querySelector(`[data-msg-id="${deletedId}"]`);
      if (el) el.remove();
    })
    .on("postgres_changes", {
      event:"UPDATE",
      schema:"public",
      table:"room_members",
      filter:`room_id=eq.${roomId}`
    }, (payload) => {
      membersCache.set(payload.new.user_id, payload.new);
      updatePeerStatus();
      refreshTicksUI();
    })
    .subscribe();
}

/* =========================
   IMAGES (private signed url -> blob)
   ========================= */
async function toBlobUrl(path){
  const { data, error } = await sb.storage.from("chat-images").createSignedUrl(path, 60);
  if(error || !data?.signedUrl) return null;

  const res = await fetch(data.signedUrl);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/* =========================
   RENDER MESSAGE
   ========================= */
async function buildMessageNode(msg){
  const div = document.createElement("div");
  div.className = "message " + (msg.user_id === myUserId ? "mine" : "other");
  div.dataset.msgId = msg.id;
  div.dataset.createdAt = msg.created_at;

  let quoteHtml = "";
  if (msg.reply) {
    const author = membersCache.get(msg.reply.user_id)?.display_name || "…";
    const snippet = (msg.reply.text || (msg.reply.image_path ? "[image]" : "") || "").slice(0,70);

    let thumbHtml = "";
    if (msg.reply.image_path) {
      const blobUrl = await toBlobUrl(msg.reply.image_path);
      thumbHtml = blobUrl
        ? `<img class="quote-thumb" src="${blobUrl}" alt="miniature" loading="lazy" />`
        : `<span class="quote-thumb placeholder">🖼️</span>`;
    }

    quoteHtml = `
      <div class="quote">
        ${thumbHtml}
        <div class="q-body">
          <div class="q-author">${esc(author)}</div>
          <div class="q-snippet">${esc(snippet)}</div>
        </div>
      </div>`;
  }

  const textHtml = msg.text ? `<div class="text">${esc(msg.text)}</div>` : "";

  let imgHtml = "";
  if(msg.image_path){
    const blobUrl = await toBlobUrl(msg.image_path);
    imgHtml = blobUrl
      ? `<img src="${blobUrl}" alt="image" loading="lazy" />`
      : `<div class="text" style="opacity:.7;">[image]</div>`;
  }

  let ticksHtml = "";
  if (msg.user_id === myUserId) {
    const peer = peerUserId ? membersCache.get(peerUserId) : null;
    let ticks = "✓";
    let cls = "ticks ticks-sent";

    if (peer) {
      const msgTime = new Date(msg.created_at).getTime();
      if (peer.last_seen_at && new Date(peer.last_seen_at).getTime() >= msgTime) {
        ticks = "✓✓";
        cls = "ticks ticks-delivered";
      }
      if (peer.last_read_at && new Date(peer.last_read_at).getTime() >= msgTime) {
        ticks = "✓✓";
        cls = "ticks ticks-read";
      }
    }

    ticksHtml = ` <span class="${cls}" data-ticks>${ticks}</span>`;
  }

  const timeHtml = `<div class="status">${formatTime(msg.created_at)}${ticksHtml}</div>`;

  const actionsHtml = `
    <div style="margin-top:4px;">
      <span class="actions" data-a="reply">répondre</span>
      <span class="actions" data-a="delete">supprimer</span>
    </div>`;

  div.innerHTML = `${quoteHtml}${textHtml}${imgHtml}${timeHtml}${actionsHtml}`;

  div.querySelector('[data-a="reply"]').addEventListener("click", () => setReply(msg));

  div.querySelector('[data-a="delete"]').addEventListener("click", async () => {
    try {
      const { error } = await sb.from("messages").delete().eq("id", msg.id);
      if (error) throw error;
      div.remove();
    } catch (err) {
      console.error(err);
      alert("Erreur suppression : " + (err.message || "inconnue"));
    }
  });

  return div;
}

/* =========================
   OPTIONAL CAMERA / GALLERY INPUTS
   ========================= */
if (cameraBtn && cameraInput) {
  cameraBtn.addEventListener("click", () => cameraInput.click());
  cameraInput.addEventListener("change", () => {
    const file = cameraInput.files?.[0];
    if (file) sendMessage(file);
    cameraInput.value = "";
  });
}

if (galleryBtn && galleryInput) {
  galleryBtn.addEventListener("click", () => galleryInput.click());
  galleryInput.addEventListener("change", () => {
    const file = galleryInput.files?.[0];
    if (file) sendMessage(file);
    galleryInput.value = "";
  });
}

/* =========================================================
   IMAGE COMPRESSION (smartphone-friendly, robuste)
   - maxSide: 1280px
   - JPEG quality: 0.75
   - Orientation EXIF corrigée pour JPEG
   - Fallback automatique -> fichier original
   ========================================================= */

function _readJpegOrientation(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.getUint16(0, false) !== 0xFFD8) return 1; // SOI
    let offset = 2;
    const length = view.byteLength;

    while (offset < length) {
      const marker = view.getUint16(offset, false);
      offset += 2;

      if (marker === 0xFFE1) { // APP1
        const app1Length = view.getUint16(offset, false);
        offset += 2;

        // "Exif\0\0"
        if (view.getUint32(offset, false) !== 0x45786966) return 1;
        offset += 6;

        const tiffOffset = offset;
        const endian = view.getUint16(tiffOffset, false);
        const little = endian === 0x4949;
        if (!little && endian !== 0x4D4D) return 1;

        const firstIFDOffset = view.getUint32(tiffOffset + 4, little);
        let ifdOffset = tiffOffset + firstIFDOffset;

        const entries = view.getUint16(ifdOffset, little);
        for (let i = 0; i < entries; i++) {
          const entryOffset = ifdOffset + 2 + i * 12;
          const tag = view.getUint16(entryOffset, little);
          if (tag === 0x0112) {
            return view.getUint16(entryOffset + 8, little);
          }
        }
        return 1;
      } else if ((marker & 0xFF00) !== 0xFF00) {
        break;
      } else {
        const size = view.getUint16(offset, false);
        offset += size;
      }
    }
  } catch (e) {
    return 1;
  }
  return 1;
}

function _drawImageWithOrientation(ctx, img, w, h, orientation) {
  switch (orientation) {
    case 2: ctx.translate(w, 0); ctx.scale(-1, 1); break;            // flip H
    case 3: ctx.translate(w, h); ctx.rotate(Math.PI); break;         // 180
    case 4: ctx.translate(0, h); ctx.scale(1, -1); break;            // flip V
    case 5: ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break;      // transpose
    case 6: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); break;  // 90
    case 7: ctx.rotate(0.5 * Math.PI); ctx.translate(w, -h); ctx.scale(-1, 1); break; // transverse
    case 8: ctx.rotate(-0.5 * Math.PI); ctx.translate(-w, 0); break; // 270
    default: break;
  }
  ctx.drawImage(img, 0, 0, w, h);
}

async function compressImageForUpload(file, { maxSide = 1280, quality = 0.75 } = {}) {
  try {
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      const ext = (file?.name?.split(".").pop() || "bin");
      return { blob: file, contentType: file?.type || "application/octet-stream", ext };
    }

    let orientation = 1;
    if (file.type === "image/jpeg" || file.type === "image/jpg") {
      const buf = await file.arrayBuffer();
      orientation = _readJpegOrientation(buf);
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    URL.revokeObjectURL(url);

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const ratio = Math.min(maxSide / srcW, maxSide / srcH, 1);
    const targetW = Math.round(srcW * ratio);
    const targetH = Math.round(srcH * ratio);

    const swapWH = [5, 6, 7, 8].includes(orientation);
    const canvas = document.createElement("canvas");
    canvas.width = swapWH ? targetH : targetW;
    canvas.height = swapWH ? targetW : targetH;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.save();
    _drawImageWithOrientation(ctx, img, targetW, targetH, orientation);
    ctx.restore();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) {
      const ext = (file.name.split(".").pop() || "jpg");
      return { blob: file, contentType: file.type || "application/octet-stream", ext };
    }

    return { blob, contentType: "image/jpeg", ext: "jpg" };

  } catch (err) {
    console.warn("Compression fallback:", err);
    const ext = (file?.name?.split(".").pop() || "bin");
    return { blob: file, contentType: file?.type || "application/octet-stream", ext };
  }
}

/* =========================
   SEND
   ========================= */
if (sendBtn) sendBtn.addEventListener("click", () => sendMessage());

async function sendMessage(fileOverride = null) {
  const text = messageInput.value.trim();
  const file = (fileOverride instanceof File) ? fileOverride : (imageInput.files?.[0] || null);

  if (!text && !file) return;

  let image_path = null;

  try {
    if (file) {
      // Limite simple (évite uploads démesurés)
      if (file.size > 15 * 1024 * 1024) {
        alert("Image trop lourde (max 15 Mo).");
        return;
      }

      // ✅ Compression smartphone (1280px, jpeg 0.75, exif ok)
      const { blob: uploadBlob, contentType, ext } = await compressImageForUpload(file, { maxSide: 1280, quality: 0.75 });

      image_path = `room/${roomId}/${myUserId}/${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage.from("chat-images")
        .upload(image_path, uploadBlob, { cacheControl: "3600", upsert: false, contentType });

      if (upErr) throw upErr;
    }

    const payload = {
      room_id: roomId,
      user_id: myUserId,
      text: text || null,
      image_path,
      reply_to: replyToId
    };

    const { error } = await sb.from("messages").insert(payload);
    if (error) throw error;

    messageInput.value = "";
    imageInput.value = "";
    messageInput.style.height = "auto";
    clearReply();

    await sb.from("room_members")
      .update({ is_typing: false, typing_updated_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", myUserId);

  } catch (err) {
    console.error(err);
    alert("Erreur envoi : " + (err.message || "inconnue"));
  }
}

/* =========================
   CLEAR CHAT
   ========================= */
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if(!roomId) return;
    if(!confirm("Voulez-vous vraiment supprimer tous les messages ?")) return;

    const { error } = await sb.rpc("clear_room_messages", { p_room_id: roomId });
    if(error){
      console.error(error);
      alert("Erreur : " + error.message);
      return;
    }
    await loadInitialMessages();
  });
}

/* =========================
   CLEANUP
   ========================= */
window.addEventListener("beforeunload", () => {
  if(presenceTimer) clearInterval(presenceTimer);
  if(typingTimer) clearTimeout(typingTimer);
  if(ticksPollTimer) clearInterval(ticksPollTimer);
});
