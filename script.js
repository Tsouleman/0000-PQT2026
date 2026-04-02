/* -------------------------------------------------------------
   CONFIG SUPABASE
------------------------------------------------------------- */
const SUPABASE_URL = "https://xdbagyfmswunrfzsyeec.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkYmFneWZtc3d1bnJmenN5ZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjc0OTEsImV4cCI6MjA5MDcwMzQ5MX0.sz-N6BjpHgVXAhhTexowsY6og9VKdY61EOXafGUEi_0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* -------------------------------------------------------------
   UTILISATEUR LOCAL
------------------------------------------------------------- */
let user = localStorage.getItem("chatUser");
if (!user) {
  user = "user" + Math.floor(Math.random() * 1000);
  localStorage.setItem("chatUser", user);
}

/* -------------------------------------------------------------
   LOGIN
------------------------------------------------------------- */
function login() {
  if (document.getElementById("password").value === "1234") {
    document.getElementById("login").style.display = "none";
    document.getElementById("chatApp").style.display = "block";
    listenMessages();
  } else {
    alert("Mot de passe incorrect");
  }
}

/* -------------------------------------------------------------
   COMPRESSION IMAGE
------------------------------------------------------------- */
async function compressImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");

  let w = img.width;
  let h = img.height;
  const MAX = 1200;

  if (w > MAX || h > MAX) {
    if (w > h) {
      h = h * MAX / w;
      w = MAX;
    } else {
      w = w * MAX / h;
      h = MAX;
    }
  }

  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);

  return new Promise(resolve =>
    canvas.toBlob(resolve, "image/jpeg", 0.75)
  );
}

/* -------------------------------------------------------------
   PREVIEW PHOTO
------------------------------------------------------------- */
let pendingFile = null;

imageInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  pendingFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    previewImg.src = reader.result;
    previewBox.style.display = "block";
  };
  reader.readAsDataURL(file);
});

cancelPreview.onclick = () => {
  pendingFile = null;
  previewBox.style.display = "none";
};

confirmPreview.onclick = async () => {
  if (pendingFile) await sendImage(pendingFile);
  pendingFile = null;
  previewBox.style.display = "none";
};

/* -------------------------------------------------------------
   CAMERA
------------------------------------------------------------- */
cameraButton.onclick = () => imageInput.click();

/* -------------------------------------------------------------
   ENVOI TEXTE
------------------------------------------------------------- */
sendText.onclick = async () => {
  const text = messageInput.value.trim();
  if (!text) return;

  await sendMessage(text, null);
  messageInput.value = "";
};

/* -------------------------------------------------------------
   ENVOI PHOTO
------------------------------------------------------------- */
async function sendImage(file) {
  const compressed = await compressImage(file);
  await sendMessage("", compressed);
}

/* -------------------------------------------------------------
   ENVOI MESSAGE (TEXTE + PHOTO)
------------------------------------------------------------- */
async function sendMessage(text, blob) {
  let imageUrl = null;

  if (blob) {
    const fileName = "photo_" + Date.now() + ".jpg";
    const path = "photos/" + fileName;

    await supabaseClient.storage
      .from("chat-images")
      .upload(path, blob);

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

/* -------------------------------------------------------------
   TEMPS RÉEL
------------------------------------------------------------- */
function listenMessages() {
  supabaseClient
    .channel("messages")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => updateMessages()
    )
    .subscribe();

  updateMessages();
}

/* -------------------------------------------------------------
   FORMAT HEURE
------------------------------------------------------------- */
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0")
  );
}

/* -------------------------------------------------------------
   AFFICHAGE MESSAGES (TEXTE + PHOTO + ✓✓)
------------------------------------------------------------- */
async function updateMessages() {
  const { data: messages } = await supabaseClient
    .from("messages")
    .select("*")
    .order("id");

  chat.innerHTML = "";

  for (let msg of messages) {
    const div = document.createElement("div");
    div.className =
      "message " + (msg.sender === user ? "mine" : "other");

    let html = "";

    if (msg.text)
      html += `<span>${msg.text}</span>`;

    if (msg.image_url)
      html += `<br>${msg.image_url}`;

    let check = "✓";
    if (msg.seen_by && msg.seen_by.length)
      check = "✓✓";

    html += `<div class="status">${check} ${formatTime(
      msg.timestamp
    )}</div>`;

    div.innerHTML = html;
    chat.appendChild(div);

    if (msg.sender !== user) {
      await supabaseClient
        .from("messages")
        .update({
          seen_by: [...msg.seen_by, { user, time: Date.now() }]
        })
        .eq("id", msg.id);
    }
  }

  chat.scrollTop = chat.scrollHeight;
}

/* -------------------------------------------------------------
   CLEAR CHAT
------------------------------------------------------------- */
async function clearChat() {
  if (!confirm("Supprimer tous les messages ?"))
    return;

  await supabaseClient.from("messages").delete().neq("id", 0);
  updateMessages();
}
