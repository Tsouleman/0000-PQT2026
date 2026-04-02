
/* ------------------------------------------------------------------
   CONFIG SUPABASE
------------------------------------------------------------------ */

const SUPABASE_URL = "https://xdbagyfmswunrfzsyeec.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkYmFneWZtc3d1bnJmenN5ZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjc0OTEsImV4cCI6MjA5MDcwMzQ5MX0.sz-N6BjpHgVXAhhTexowsY6og9VKdY61EOXafGUEi_0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ------------------------------------------------------------------
   IDENTITÉ UTILISATEUR
------------------------------------------------------------------ */

let user = localStorage.getItem("chatUser");
if (!user) {
  user = "user" + Math.floor(Math.random() * 1000);
  localStorage.setItem("chatUser", user);
}

/* ------------------------------------------------------------------
   LOGIN
------------------------------------------------------------------ */

function login() {
  const pass = document.getElementById("password").value;
  if (pass === "1234") {
    document.getElementById("login").style.display = "none";
    document.getElementById("chatApp").style.display = "flex";
    listenMessages();
  } else {
    alert("Mot de passe incorrect");
  }
}

/* ------------------------------------------------------------------
   COMPRESS IMAGE (JPEG 0.75) + resize max 1200px
------------------------------------------------------------------ */

async function compressImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");

  let w = img.width;
  let h = img.height;
  const MAX = 1200;

  if (w > MAX || h > MAX) {
    if (w > h) {
      h = Math.floor((h * MAX) / w);
      w = MAX;
    } else {
      w = Math.floor((w * MAX) / h);
      h = MAX;
    }
  }

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.75)
  );
}

/* ------------------------------------------------------------------
   PREVIEW PHOTO AVANT ENVOI
------------------------------------------------------------------ */

let pendingFile = null;

document.getElementById("imageInput").addEventListener("change", async () => {
  const file = document.getElementById("imageInput").files[0];
  if (!file) return;

  pendingFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("previewImg").src = reader.result;
    document.getElementById("previewBox").style.display = "block";
  };
  reader.readAsDataURL(file);
});

/* Annuler */
document.getElementById("cancelPreview").addEventListener("click", () => {
  pendingFile = null;
  document.getElementById("previewBox").style.display = "none";
});

/* Confirmer l’envoi */
document.getElementById("confirmPreview").addEventListener("click", async () => {
  if (pendingFile) await sendImageOnly(pendingFile);
  pendingFile = null;
  document.getElementById("previewBox").style.display = "none";
});

/* ------------------------------------------------------------------
   CAMERA → ouvre input
------------------------------------------------------------------ */

document.getElementById("cameraButton").addEventListener("click", () => {
  document.getElementById("imageInput").click();
});

/* ------------------------------------------------------------------
   ENVOI TEXTE SEUL
------------------------------------------------------------------ */

async function sendTextOnly() {
  const text = document.getElementById("messageInput").value.trim();
  if (!text) return;

  await sendMessage(text, null);
  document.getElementById("messageInput").value = "";
  autoResizeTextarea();
}

/* ------------------------------------------------------------------
   ENVOI PHOTO SEULE
------------------------------------------------------------------ */

async function sendImageOnly(fileOriginal) {
  const compressed = await compressImage(fileOriginal);
  await sendMessage("", compressed);
}

/* ------------------------------------------------------------------
   ENVOI MESSAGE (TEXTE + PHOTO)
------------------------------------------------------------------ */

async function sendMessage(text, photoBlob) {
  let imageUrl = null;

  if (photoBlob) {
    const fileName = "photo_" + Date.now() + ".jpg";
    const path = "photos/" + fileName;

    const response = await supabaseClient.storage
      .from("chat-images")
      .upload(path, photoBlob);

    if (response.error) {
      alert("Erreur upload image : " + response.error.message);
      return;
    }

    imageUrl = supabaseClient.storage
      .from("chat-images")
      .getPublicUrl(path).data.publicUrl;
  }

  await supabaseClient.from("messages").insert({
    sender: user,
    text: text || "",
    image_url: imageUrl,
    timestamp: Date.now(),
    seen_by: []
  });
}

/* ------------------------------------------------------------------
   TEMPS RÉEL
------------------------------------------------------------------ */

function listenMessages() {
  supabaseClient
    .channel("messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => updateMessages()
    )
    .subscribe();

  updateMessages();
}

/* ------------------------------------------------------------------
   AFFICHAGE MESSAGES (TEXTE + IMAGE + ✓✓ HEURE)
------------------------------------------------------------------ */

function formatTime(ts) {
  const d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0")
  );
}

async function updateMessages() {
  const chat = document.getElementById("chat");

  const { data: messages } = await supabaseClient
    .from("messages")
    .select("*")
    .order("id", { ascending: true });

  chat.innerHTML = "";

  for (let msg of messages) {
    const div = document.createElement("div");
    div.className = "message " + (msg.sender === user ? "mine" : "other");

    let html = "";

    /* TEXTE */
    if (msg.text) html += `<span>${msg.text}</span>`;

    /* IMAGE */
    if (msg.image_url) {
      html += `<br>${msg.image_url}`;
    }

    /* ✓✓ + heure */
    let check = "✓";
    let readInfo = "";

    if (msg.seen_by && msg.seen_by.length > 0) {
      check = "✓✓";
      const lastSeen = msg.seen_by[msg.seen_by.length - 1];
      readInfo = ` (vu ${formatTime(lastSeen.time)})`;
    }

    html += `<div class="status">${check} ${formatTime(
      msg.timestamp
    )}${readInfo}</div>`;

    div.innerHTML = html;
    chat.appendChild(div);

    /* Marquer comme lu */
    if (msg.sender !== user) {
      const seenEntry = { user, time: Date.now() };
      supabaseClient
        .from("messages")
        .update({ seen_by: [...msg.seen_by, seenEntry] })
        .eq("id", msg.id);
    }
  }

  chat.scrollTop = chat.scrollHeight;
}

/* ------------------------------------------------------------------
   AUTO-RESIZE TEXTAREA
------------------------------------------------------------------ */

const messageInput = document.getElementById("messageInput");
messageInput.addEventListener("input", autoResizeTextarea);

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
}
