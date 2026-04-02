/* -------------------------------------------------------------
   CONFIG SUPABASE
------------------------------------------------------------- */
const SUPABASE_URL = "https://xdbagyfmswunrfzsyeec.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkYmFneWZtc3d1bnJmenN5ZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjc0OTEsImV4cCI6MjA5MDcwMzQ5MX0.sz-N6BjpHgVXAhhTexowsY6og9VKdY61EOXafGUEi_0";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* UTILISATEUR LOCAL */
let user = localStorage.getItem("chatUser");
if (!user) {
  user = "user" + Math.floor(Math.random() * 1000);
  localStorage.setItem("chatUser", user);
}

/* LOGIN */
function login() {
  const pass = document.getElementById("password").value;
  if (pass === "1234") {
    document.getElementById("login").style.display = "none";
    document.getElementById("chatApp").style.display = "block";
    listenMessages();
  } else {
    alert("Mot de passe incorrect");
  }
}

/* COMPRESSION IMAGE */
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

/* PREVIEW */
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

document.getElementById("cancelPreview").addEventListener("click", () => {
  pendingFile = null;
  document.getElementById("previewBox").style.display = "none";
});

document.getElementById("confirmPreview").addEventListener("click", async () => {
  if (pendingFile) await sendImage(pendingFile);
  pendingFile = null;
  document.getElementById("previewBox").style.display = "none";
});

/* CAMERA */
document.getElementById("cameraButton").addEventListener("click", () => {
  document.getElementById("imageInput").click();
});

/* ENVOI TEXTE */
async function sendTextOnly() {
  const text = document.getElementById("messageInput").value.trim();
  if (!text) return;

  await sendMessage(text, null);
  document.getElementById("messageInput").value = "";
}

/* ENVOI IMAGE */
async function sendImage(file) {
  const compressed = await compressImage(file);
  await sendMessage("", compressed);
}

/* ENVOI MESSAGE */
async function sendMessage(text, imageBlob) {
  let imageUrl = null;

  if (imageBlob) {
    const fileName = "photo_" + Date.now() + ".jpg";
    const path = "photos/" + fileName;

    await supabaseClient.storage
      .from("chat-images")
      .upload(path, imageBlob);

    imageUrl = supabaseClient.storage
      .from("chat-images")
      .getPublicUrl(path).data.publicUrl;
  }

  await supabaseClient.from("messages").insert({
    sender: user,
    text,
    image_url: imageUrl,
    timestamp: Date.now(),
    seen_by: []
  });
}

/* REALTIME */
function listenMessages() {
  supabaseClient
    .channel("messages")
    .on("postgres_changes", { event: "*", table: "messages", schema: "public" }, () =>
      updateMessages()
    )
    .subscribe();

  updateMessages();
}

/* FORMATER L'HEURE */
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, "0") +
         ":" +
         d.getMinutes().toString().padStart(2, "0");
}

/* AFFICHAGE MESSAGES */
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

    if (msg.text) html += `<span>${msg.text}</span>`;
    if (msg.image_url) html += `<br>${msg.image_url}`;

    let check = "✓";
    let readInfo = "";

    if (msg.seen_by && msg.seen_by.length > 0) {
      check = "✓✓";
      const last = msg.seen_by[msg.seen_by.length - 1];
      readInfo = ` (vu ${formatTime(last.time)})`;
    }

    html += `<div class="status">${check} ${formatTime(msg.timestamp)}${readInfo}</div>`;

    div.innerHTML = html;
    chat.appendChild(div);

    if (msg.sender !== user) {
      const seenEntry = { user, time: Date.now() };
      await supabaseClient
        .from("messages")
        .update({ seen_by: [...msg.seen_by, seenEntry] })
        .eq("id", msg.id);
    }
  }

  chat.scrollTop = chat.scrollHeight;
}

/* CLEAR */
async function clearChat() {
  if (!confirm("Supprimer tous les messages ?")) return;

  await supabaseClient.from("messages").delete().neq("id", 0);
  updateMessages();
}
