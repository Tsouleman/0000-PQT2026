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
// -------------------------
// LOGIN
// -------------------------
function login() {
  const pass = document.getElementById("password").value;
  if (pass === "1234") {
    document.getElementById("login").style.display = "none";
    document.getElementById("chatApp").style.display = "flex";
    startChatListener();
  } else {
    alert("Mot de passe incorrect");
  }
}

// -------------------------
// ENVOI MESSAGE
// -------------------------
function sendMessage() {
  const text = document.getElementById("messageInput").value;
  const fileInput = document.getElementById("imageInput");
  const file = fileInput.files[0];

  if (!text && !file) return;

  if (file) {
    const fileName = Date.now() + "_" + file.name.replace(/\s/g, "_");
    const storageRef = storage.ref("images/" + fileName);

    const uploadTask = storageRef.put(file);

    uploadTask.on('state_changed',
      null,
      (error) => { alert("Erreur lors de l'envoi de l'image: " + error.message); },
      () => {
        uploadTask.snapshot.ref.getDownloadURL().then((url) => {
          db.ref("messages").push({
            text: text || "",
            image: url,
            sender: user,
            timestamp: Date.now(),
            seenBy: []
          });
          document.getElementById("messageInput").value = "";
          fileInput.value = "";
          autoResizeTextarea();
        });
      }
    );
  } else {
    db.ref("messages").push({
      text: text,
      sender: user,
      timestamp: Date.now(),
      seenBy: []
    });
    document.getElementById("messageInput").value = "";
    autoResizeTextarea();
  }
}

// -------------------------
// FORMAT HEURE
// -------------------------
function formatTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  let m = d.getMinutes();
  if (h < 10) h = "0" + h;
  if (m < 10) m = "0" + m;
  return h + ":" + m;
}

// -------------------------
// ÉCOUTE CHAT
// -------------------------
function startChatListener() {
  const chat = document.getElementById("chat");

  db.ref("messages").on("value", snapshot => {
    chat.innerHTML = "";
    const data = snapshot.val();
    if (!data) return;

    for (let id in data) {
      const msg = data[id];
      const div = document.createElement("div");
      div.className = "message " + (msg.sender === user ? "mine" : "other");

      let status = "✓";
      let readTime = "";
      if (msg.seenBy && msg.seenBy.length > 0) {
        status = "✓✓";
        if (msg.sender === user) {
          const others = msg.seenBy.filter(e => e.user !== user && e.time);
          if (others.length > 0) {
            const lastReadTime = Math.max(...others.map(e => e.time));
            readTime = ` (vu ${formatTime(lastReadTime)})`;
          }
        }
      }

      let actions = "";
      if (msg.sender === user) {
        actions = `
          <span class="actions" onclick="editMessage('${id}','${msg.text}')">modifier</span>
          <span class="actions" onclick="deleteMessage('${id}')">supprimer</span>
        `;
      }

      div.innerHTML = `
        ${msg.text || ""}
        ${msg.image ? "<img src='" + msg.image + "'>" : ""}
        <div class="status">${status} ${formatTime(msg.timestamp)}${readTime}</div>
        ${actions}
      `;
      chat.appendChild(div);

      if (msg.sender !== user) {
        if (!msg.seenBy) msg.seenBy = [];
        const alreadySeen = msg.seenBy.find(e => e.user === user);
        if (!alreadySeen) {
          msg.seenBy.push({ user: user, time: Date.now() });
          db.ref("messages/" + id).update({ seenBy: msg.seenBy });
        }
      }
    }

    chat.scrollTop = chat.scrollHeight;
  });
}

// -------------------------
// SUPPRIMER / MODIFIER / VIDER CHAT
// -------------------------
function deleteMessage(id) { db.ref("messages/" + id).remove(); }
function editMessage(id, text) {
  const newText = prompt("Modifier message", text);
  if (newText) db.ref("messages/" + id).update({ text: newText });
}
function clearChat() {
  if (confirm("Voulez-vous vraiment supprimer tous les messages ?")) db.ref("messages").remove();
}

// -------------------------
// ENVOI AVEC ENTER
// -------------------------
const messageInput = document.getElementById("messageInput");
messageInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

// -------------------------
// AUTO RESIZE TEXTAREA
// -------------------------
messageInput.addEventListener('input', autoResizeTextarea);
function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = messageInput.scrollHeight + 'px';
}

