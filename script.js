
// ----------------------------------------------------
// CONFIG SUPABASE
// ----------------------------------------------------
const SUPABASE_URL = "https://xdbagyfmswunrfzsyeec.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkYmFneWZtc3d1bnJmenN5ZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjc0OTEsImV4cCI6MjA5MDcwMzQ5MX0.sz-N6BjpHgVXAhhTexowsY6og9VKdY61EOXafGUEi_0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------------------------------------------
// UTILISATEUR LOCAL
// ----------------------------------------------------
let user = localStorage.getItem("chatUser");
if (!user) {
  user = "user" + Math.floor(Math.random() * 1000);
  localStorage.setItem("chatUser", user);
}

// ----------------------------------------------------
// LOGIN
// ----------------------------------------------------
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

// ----------------------------------------------------
// ENVOI MESSAGE + PHOTO
// ----------------------------------------------------
async function sendMessage() {
  const text = document.getElementById("messageInput").value.trim();
  const fileInput = document.getElementById("imageInput");
  const file = fileInput.files[0];

  console.log("📷 Fichier reçu :", file);

  if (!text && !file) return;

  let imageUrl = null;

  if (file) {
    const fileName =
      "photo_" + Date.now() + "_" + file.name.replace(/\s/g, "_");
    const path = "photos/" + fileName;

    console.log("📤 Upload →", path);

    const response = await supabaseClient.storage
      .from("chat-images")
      .upload(path, file);

    console.log("📥 Réponse upload :", response);

    if (response.error) {
      console.error("❌ Upload error :", response.error);
      alert("Erreur upload image : " + response.error.message);
      return;
    }

    imageUrl = supabaseClient.storage
      .from("chat-images")
      .getPublicUrl(path).data.publicUrl;

    console.log("✅ URL publique :", imageUrl);
  }

  await supabaseClient.from("messages").insert({
    sender: user,
    text: text || "",
    image_url: imageUrl,
    seen_by: []
  });

  document.getElementById("messageInput").value = "";
  fileInput.value = "";
  autoResizeTextarea();
}

// ----------------------------------------------------
// TEMPS RÉEL
// ----------------------------------------------------
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

// ----------------------------------------------------
// AFFICHAGE DES MESSAGES + IMAGES
// ----------------------------------------------------
async function updateMessages() {
  const chat = document.getElementById("chat");

  const { data: messages, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Erreur read messages:", error);
    return;
  }

  chat.innerHTML = "";

  messages.forEach((msg) => {
    const div = document.createElement("div");
    div.className = "message " + (msg.sender === user ? "mine" : "other");

    let html = "";

    // ✅ TEXTE
    if (msg.text) html += `<span>${msg.text}</span>`;

    // ✅ AFFICHAGE IMAGE (en <img>)
    if (msg.image_url) {
      html += `<br>${msg.image_url}`;
    }

    div.innerHTML = html;
    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
}

// ----------------------------------------------------
// CLEAR CHAT
// ----------------------------------------------------
async function clearChat() {
  if (!confirm("Supprimer tous les messages ?")) return;

  const { data: messages } = await supabaseClient
    .from("messages")
    .select("image_url");

  for (let msg of messages) {
    if (msg.image_url) {
      const filename = msg.image_url.split("/").pop();
      await supabaseClient.storage
        .from("chat-images")
        .remove(["photos/" + filename]);
    }
  }

  await supabaseClient.from("messages").delete().neq("id", 0);
}

// ----------------------------------------------------
// AUTO RESIZE
// ----------------------------------------------------
const messageInput = document.getElementById("messageInput");
messageInput.addEventListener("input", autoResizeTextarea);

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
}

// ----------------------------------------------------
// CAMERA
// ----------------------------------------------------
document.getElementById("cameraButton").addEventListener("click", () => {
  document.getElementById("imageInput").click();
});
