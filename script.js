// -------------------------
// INITIALISATION FIREBASE
// -------------------------
const firebaseConfig = {
apiKey:"AIzaSyCmw1nlfvNhzrH4_0f72lMQthgiToCLBzI",
authDomain:"pqt2026.firebaseapp.com",
databaseURL:"https://pqt2026-default-rtdb.firebaseio.com",
projectId:"pqt2026",
storageBucket:"pqt2026.firebasestorage.app"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();

// Utilisateur unique pour session
const user = localStorage.getItem("chatUser") || "user" + Math.floor(Math.random() * 1000);
localStorage.setItem("chatUser", user);

// -------------------------
// LOGIN
// -------------------------
function login() {
  const pass = document.getElementById("password").value;
  if (pass === "1234") {
    document.getElementById("login").style.display = "none";
    document.getElementById("chatApp").style.display = "flex";

    // ----------------------
    // LANCER L'ÉCOUTE FIREBASE
    // ----------------------
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
  const file = document.getElementById("imageInput").files[0];
  if (!text && !file) return;

  if (file) {
    const ref = storage.ref("images/" + Date.now());
    ref.put(file).then(snapshot => {
      snapshot.ref.getDownloadURL().then(url => {
        db.ref("messages").push({
          text: text,
          image: url,
          sender: user,
          timestamp: Date.now(),
          seenBy: []
        });
      });
    });
  } else {
    db.ref("messages").push({
      text: text,
      sender: user,
      timestamp: Date.now(),
      seenBy: []
    });
  }

  document.getElementById("messageInput").value = "";
  document.getElementById("imageInput").value = "";
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
// ÉCOUTE CHAT (APRES LOGIN)
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

      // Statut lu
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

      // Actions pour l'auteur
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

      // Marquer comme lu pour les autres
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
// SUPPRIMER
// -------------------------
function deleteMessage(id) {
  db.ref("messages/" + id).remove();
}

// -------------------------
// MODIFIER
// -------------------------
function editMessage(id, text) {
  const newText = prompt("Modifier message", text);
  if (newText) {
    db.ref
