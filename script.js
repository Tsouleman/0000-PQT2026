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

const user = localStorage.getItem("chatUser") || "user"+Math.floor(Math.random()*1000);
localStorage.setItem("chatUser",user);

function login(){

const pass = document.getElementById("password").value;

if(pass === "1234"){

document.getElementById("login").style.display="none";
document.getElementById("chatApp").style.display="block";

}

}

function sendMessage(){

const text = document.getElementById("messageInput").value;
const file = document.getElementById("imageInput").files[0];

if(file){

const ref = storage.ref("images/"+Date.now());

ref.put(file).then(snapshot=>{

snapshot.ref.getDownloadURL().then(url=>{

db.ref("messages").push({
text:text,
image:url,
sender:user,
timestamp:Date.now(),
seenBy:[]
});

});

});

}else{

db.ref("messages").push({
text:text,
sender:user,
timestamp:Date.now(),
seenBy:[]
});

}

document.getElementById("messageInput").value="";
}

const chat = document.getElementById("chat");

db.ref("messages").on("value", snapshot=>{

chat.innerHTML="";

const data = snapshot.val();

for(let id in data){

const msg = data[id];

const div = document.createElement("div");
div.className="message";

let seen="✓";

if(msg.seenBy && msg.seenBy.length>0) seen="✓✓";

div.innerHTML = `
${msg.text || ""}
${msg.image ? "<img src='"+msg.image+"'>" : ""}
<div class="status">${seen}</div>
<span class="actions" onclick="editMessage('${id}','${msg.text}')">modifier</span>
<span class="actions" onclick="deleteMessage('${id}')">supprimer</span>
`;

chat.appendChild(div);

if(msg.sender !== user){

if(!msg.seenBy) msg.seenBy=[];

if(!msg.seenBy.includes(user)){

msg.seenBy.push(user);

db.ref("messages/"+id).update({
seenBy:msg.seenBy
});

}

}

}

chat.scrollTop = chat.scrollHeight;

});

function deleteMessage(id){

db.ref("messages/"+id).remove();

}

function editMessage(id,text){

const newText = prompt("Modifier message",text);

if(newText){

db.ref("messages/"+id).update({
text:newText
});

}

}



document.getElementById("messageInput").addEventListener("keypress", function(event) {

if (event.key === "Enter") {

event.preventDefault();

sendMessage();

}

});
