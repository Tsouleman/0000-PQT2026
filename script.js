// ----------------------------------------------------
// CONFIG SUPABASE
// ----------------------------------------------------
const SUPABASE_URL = "https://xdbagyfmswunrfzsyeec.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkYmFneWZtc3d1bnJmenN5ZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjc0OTEsImV4cCI6MjA5MDcwMzQ5MX0.sz-N6BjpHgVXAhhTexowsY6og9VKdY61EOXafGUEi_0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Identité pseudo-user
let user = localStorage.getItem("chatUser") || "user" + Math.floor(Math.random() * 1000);
localStorage.setItem("chatUser", user);

// ----------------------------------------------------
// LOGIN SIMPLE
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

    if (!text && !file) return;

    let imageUrl = null;

    // UPLOAD IMAGE
    if (file) {
        const fileName = "photo_" + Date.now() + "_" + file.name.replace(/\s/g, "_");

        const { data, error } = await supabaseClient.storage
            .from("chat-images")
            .upload(fileName, file);

        if (error) {
            alert("Erreur upload image : " + error.message);
            return;
        }

        imageUrl = supabaseClient.storage
            .from("chat-images")
            .getPublicUrl(fileName).data.publicUrl;
    }

    // INSERT MESSAGE
    await supabaseClient
        .from("messages")
        .insert({
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
            { event: "*", schema: "public", table: "messages" },
            payload => {
                updateMessages();
            }
        )
        .subscribe();

    updateMessages();
}

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

    messages.forEach(msg => {
        const div = document.createElement("div");
        div.className = "message " + (msg.sender === user ? "mine" : "other");

        let html = "";

        if (msg.text) html += `<span>${msg.text}</span>`;
        if (msg.image_url) html += `<br><img src="${msg.image_url}">`;

        div.innerHTML = html;

        chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
}

// ----------------------------------------------------
// VIDER LE CHAT + SUPPRESSION IMAGES STOCKÉES
// ----------------------------------------------------
async function clearChat() {
    if (!confirm("Supprimer tous les messages ?")) return;

    const { data: messages } = await supabaseClient
        .from("messages")
        .select("image_url");

    for (let msg of messages) {
        if (msg.image_url) {
            const path = msg.image_url.split("/").pop();
            await supabaseClient.storage
                .from("chat-images")
                .remove([path]);
        }
    }

    await supabaseClient.from("messages").delete().neq("id", 0);
}

// ----------------------------------------------------
// AUTO RESIZE TEXTAREA
// ----------------------------------------------------
const messageInput = document.getElementById("messageInput");
messageInput.addEventListener("input", autoResizeTextarea);

function autoResizeTextarea() {
    messageInput.style.height = "auto";
    messageInput.style.height = messageInput.scrollHeight + "px";
}

// ----------------------------------------------------
// APPAREIL PHOTO
// ----------------------------------------------------
document.getElementById("cameraButton").addEventListener("click", () => {
    document.getElementById("imageInput").click();
});
