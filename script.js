const div = document.createElement("div");

div.className = "message " + (msg.sender === user ? "mine" : "other";

let seen="✓";

if(msg.seenBy && msg.seenBy.length>0) seen="✓✓";

div.innerHTML = `
${msg.text || ""}
${msg.image ? "<img src='"+msg.image+"'>" : ""}
<div class="status">${seen}</div>
<span class="actions" onclick="editMessage('${id}','${msg.text}')">modifier</span>
<span class="actions" onclick="deleteMessage('${id}')">supprimer</span>
`;


});
