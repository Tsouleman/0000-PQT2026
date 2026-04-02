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
// ENVOI MESSAGE + PHOTO (iOS + Android OK)
// ----------------------------------------------------
async function sendMessage() {
  const text = document.getElementById("messageInput").value.trim();
  const fileInput = document.getElementById("imageInput");
  const file = fileInput.files[0];

  console.log("📷 Fichier reçu par input :", file);

  if (!text && !file) return;

  let imageUrl = null;

  // ✅ UPLOAD IMAGE AVEC DOSSIER "photos/"
  if (file) {
    const fileName =
      "photo_" + Date.now() + "_" + file.name.replace(/\s/g, "_");
    const path = "photos/" + fileName;

    console.log("📤 Upload →", path, file);

    const response = await supabaseClient.storage
      .from("chat-images")
      .upload(path, file);

    console.log("📥 Réponse upload :", response);

    if (response.error) {
      console.error("❌ Upload error COMPLET :", response.error);
      alert("Erreur upload image : " + response.error.message);
      return;
    }

    imageUrl = supabaseClient.storage
      .from("chat-images")
      .getPublicUrl(path).data.publicUrl;

    console.log("✅ URL publique :", imageUrl);
  }

  // ✅ INSERT MESSAGE
  const { error: insertError } = await supabaseClient
    .from("messages")
    .insert({
      sender: user,
      text: text || "",
      image_url: imageUrl,
      seen_by: []
    });

  if (insertError) {
    console.error("Erreur insert:", insertError);
    alert("Erreur insertion : " + insertError.message);
  }

  document.getElementById("messageInput").value = "";
  fileInput.value = "";
  autoResizeTextarea();
}

// ----------------------------------------------------
// TEMPS RÉEL SUPABASE 2026
// ----------------------------------------------------
function listenMessages() {
  supabaseClient
    .channel("messages_channel")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      () => updateMessages()
    )
    .subscribe();

  updateMessages();
}

// ----------------------------------------------------
// AFFICHAGE DES MESSAGES
// ----------------------------------------------------
async function updateMessages() {
  const chat = document.getElementById("chat");

  const { data: messages, error } = await supabaseClient
