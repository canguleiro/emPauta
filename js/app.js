import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  query, orderBy, onSnapshot, serverTimestamp, arrayUnion, deleteDoc,
  limit, getDocs, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getBytes, deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyASQkgnQkeKjXKrmT3yMV9zcUVxec3NvrA",
  authDomain: "em-pauta-d6e92.firebaseapp.com",
  projectId: "em-pauta-d6e92",
  storageBucket: "em-pauta-d6e92.firebasestorage.app",
  messagingSenderId: "94994518950",
  appId: "1:94994518950:web:e60bb5bc8358752f47567"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const ROOM_ID = "private-room";
const MSGS = collection(db, "private", ROOM_ID, "messages");
const STATUS = collection(db, "private", ROOM_ID, "status");
const KEYS = collection(db, "private", ROOM_ID, "keys");

const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

let me = null;
let members = null;
let myNick = "";
let messages = [];
let unsubscribeMessages = null;
let unsubscribeKeys = null;
let unsubscribeStatus = null;
let keyCache = new Map();
let privateKey = null;
let publicKeyJwk = null;
let sharedSecretCache = new Map();
let replyTarget = null;
let menuOpen = null;
let searchText = "";
let selectedFile = null;
let locked = false;
let pinHash = localStorage.getItem("ep_device_pin_hash") || "";
let pinSalt = localStorage.getItem("ep_device_pin_salt") || "";
let pinBuffer = "";
let pinReady = false;
let lastActivity = Date.now();
let lockTimer = null;
let ttlSeconds = Number(localStorage.getItem("ep_ttl") || "0");

const EMOJIS = ["😊","😂","🤣","😍","😉","😎","🤔","🙄","🤫","😭","😱","😴","❤️","🔥","👍","👎","👏","🙏","💪","✅","⚠️","❌","💯","💡","🔒","☕","🎉","🚀","📱","📰","⭐","🙂","😅","🥰","😘","🤝","👀","🫶","✨","💬","📌","🗑️","🔐","🕵️","🤍","🖤"];

function showToast(text){
  $("toast").textContent = text;
  $("toast").classList.remove("hidden");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => $("toast").classList.add("hidden"), 2600);
}

function b64(bytes){
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for(let i=0;i<u8.length;i+=0x8000) s += String.fromCharCode(...u8.subarray(i,i+0x8000));
  return btoa(s);
}
function unb64(s){
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomId(bytes=16){ return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/[+/=]/g,"").slice(0,22); }
function initials(name){ return (name || "EP").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase(); }

async function idbOpen(){
  return new Promise((resolve,reject)=>{
    const r = indexedDB.open("em-pauta-private", 1);
    r.onupgradeneeded = () => {
      const dbi = r.result;
      if(!dbi.objectStoreNames.contains("keys")) dbi.createObjectStore("keys");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(k){
  const dbi = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=dbi.transaction("keys","readonly");
    const req=tx.objectStore("keys").get(k);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbPut(k,v){
  const dbi=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=dbi.transaction("keys","readwrite");
    tx.objectStore("keys").put(v,k);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}
async function idbDelete(k){
  const dbi=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=dbi.transaction("keys","readwrite");
    tx.objectStore("keys").delete(k);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}

async function ensureIdentity(){
  const storageKey = `privateKey:${me.uid}`;
  const saved = await idbGet(storageKey);

  if(saved?.privateKey && saved?.publicKeyJwk){
    // A chave privada fica armazenada como CryptoKey não exportável.
    privateKey = saved.privateKey;
    publicKeyJwk = saved.publicKeyJwk;
  } else {
    // O par é exportável apenas durante a inicialização. Depois,
    // a chave privada é reimportada como não exportável antes de ser salva.
    const pair = await crypto.subtle.generateKey(
      {name:"ECDH", namedCurve:"P-256"}, true, ["deriveBits"]
    );
    const exportedPublic = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const exportedPrivate = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const lockedPrivate = await crypto.subtle.importKey(
      "jwk", exportedPrivate,
      {name:"ECDH", namedCurve:"P-256"},
      false, ["deriveBits"]
    );
    privateKey = lockedPrivate;
    publicKeyJwk = exportedPublic;
    await idbPut(storageKey, {privateKey: lockedPrivate, publicKeyJwk});
  }

  await setDoc(doc(KEYS, me.uid), {
    uid: me.uid,
    publicKey: publicKeyJwk,
    nick: myNick,
    updatedAt: serverTimestamp()
  }, {merge:true});
}

async function importPublic(jwk){
  return crypto.subtle.importKey("jwk", jwk, {name:"ECDH", namedCurve:"P-256"}, false, []);
}

async function getSharedSecret(otherUid){
  if(sharedSecretCache.has(otherUid)) return sharedSecretCache.get(otherUid);
  const other = keyCache.get(otherUid);
  if(!other?.publicKey) throw new Error("A chave pública da outra pessoa ainda não está disponível.");
  const pub = await importPublic(other.publicKey);
  const bits = await crypto.subtle.deriveBits({name:"ECDH", public:pub}, privateKey, 256);
  const secret = new Uint8Array(bits);
  sharedSecretCache.set(otherUid, secret);
  return secret;
}

async function deriveMessageKey(secret, salt){
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {name:"HKDF", hash:"SHA-256", salt, info:enc.encode("EmPauta-v2-message")},
    base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]
  );
}

async function encryptObject(obj, otherUid, aadText){
  const secret = await getSharedSecret(otherUid);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMessageKey(secret, salt);
  const plaintext = enc.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt(
    {name:"AES-GCM", iv, additionalData:enc.encode(aadText)},
    key, plaintext
  );
  return {ciphertext:b64(cipher), salt:b64(salt), iv:b64(iv), v:2};
}

async function decryptObject(data, otherUid, aadText){
  const secret = await getSharedSecret(otherUid);
  const salt = unb64(data.salt), iv = unb64(data.iv);
  const key = await deriveMessageKey(secret, salt);
  const plain = await crypto.subtle.decrypt(
    {name:"AES-GCM", iv, additionalData:enc.encode(aadText)},
    key, unb64(data.ciphertext)
  );
  return JSON.parse(dec.decode(plain));
}

async function getOtherUid(){
  const ids=[...keyCache.keys()].filter(x=>x!==me.uid);
  return ids[0] || null;
}

async function verifyMembership(){
  // A autorização real é feita pelas Firebase Security Rules.
  // O cliente não precisa conhecer uma lista de UIDs nem de guardar
  // um documento de acesso legível.
  if(!me) throw new Error("Sessão não autenticada.");
}

async function saveStatus(typing=false){
  if(!me) return;
  await setDoc(doc(STATUS, me.uid), {
    uid:me.uid, nick:myNick, typing, lastActive:serverTimestamp()
  }, {merge:true}).catch(()=>{});
}

function updateActivity(){
  lastActivity=Date.now();
  if(locked) return;
  if(localStorage.getItem("ep_auto_lock")==="1" && pinReady && lockTimer===null){
    lockTimer=setInterval(()=>{
      if(Date.now()-lastActivity > 5*60*1000) lockApp();
    },15000);
  }
}
["pointerdown","keydown","touchstart"].forEach(ev=>window.addEventListener(ev, updateActivity, {passive:true}));

async function hashPin(value, saltB64){
  const salt=saltB64?unb64(saltB64):crypto.getRandomValues(new Uint8Array(16));
  const base=await crypto.subtle.importKey("raw",enc.encode(value),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},base,256);
  return {hash:b64(bits),salt:b64(salt)};
}

async function loadPin(){
  pinReady=!!pinHash;
}

async function setNewPin(value){
  const result=await hashPin(value);
  pinHash=result.hash;
  pinSalt=result.salt;
  localStorage.setItem("ep_device_pin_hash",pinHash);
  localStorage.setItem("ep_device_pin_salt",pinSalt);
  pinReady=true;
}

async function checkPin(value){
  if(!pinHash||!pinSalt) return false;
  const result=await hashPin(value,pinSalt);
  return result.hash===pinHash;
}

function base64url(bytes){
  return b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function fromBase64url(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  return unb64(s);
}

async function registerBiometric(){
  if(!window.PublicKeyCredential || !navigator.credentials){
    showToast("A biometria do navegador não está disponível neste dispositivo.");
    return;
  }
  try{
    const credential=await navigator.credentials.create({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      rp:{name:"Em Pauta",id:location.hostname},
      user:{id:crypto.getRandomValues(new Uint8Array(16)),name:myNick||"usuario",displayName:myNick||"Usuário"},
      pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
      authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"},
      timeout:60000,attestation:"none"
    }});
    if(credential){
      localStorage.setItem("ep_biometric_cred",base64url(credential.rawId));
      showToast("Biometria deste dispositivo ativada.");
    }
  }catch(e){
    console.warn(e);
    showToast("Não foi possível ativar a biometria.");
  }
}

async function unlockWithBiometric(){
  const id=localStorage.getItem("ep_biometric_cred");
  if(!id||!window.PublicKeyCredential||!navigator.credentials){
    showToast("Biometria ainda não foi configurada.");
    return;
  }
  try{
    const credential=await navigator.credentials.get({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      rpId:location.hostname,
      allowCredentials:[{type:"public-key",id:fromBase64url(id)}],
      userVerification:"required",timeout:60000
    }});
    if(credential) unlockApp();
  }catch(e){
    console.warn(e);
    showToast("Biometria não autorizada.");
  }
}

function setupPinpad(){
  const pad=$("pinpad");
  const keys=["1","2","3","4","5","6","7","8","9","⌫","0","↵"];
  pad.innerHTML="";
  keys.forEach(k=>{
    const b=document.createElement("button");
    b.textContent=k;
    b.onclick=()=>handlePinKey(k);
    pad.appendChild(b);
  });
  renderDots();
}
function renderDots(){
  $("pinDots").innerHTML="";
  for(let i=0;i<6;i++){
    const d=document.createElement("span"); d.className="dot"+(pinBuffer.length>i?" on":""); $("pinDots").appendChild(d);
  }
}
async function handlePinKey(k){
  if(k==="⌫"){pinBuffer=pinBuffer.slice(0,-1);renderDots();return;}
  if(k==="↵"){
    if(pinBuffer.length===6){
      if(pinReady){
        if(await checkPin(pinBuffer)){unlockApp();}
        else {pinBuffer="";renderDots();showToast("PIN incorreto.");}
      } else {
        await setNewPin(pinBuffer);
        unlockApp();
        showToast("PIN deste dispositivo configurado.");
      }
    }
    return;
  }
  if(/^\d$/.test(k)&&pinBuffer.length<6){
    pinBuffer+=k;renderDots();
    if(pinBuffer.length===6)setTimeout(()=>handlePinKey("↵"),100);
  }
}
function lockApp(){
  if(!pinReady) return;
  locked=true; pinBuffer=""; $("lockScreen").classList.remove("hidden"); renderDots();
}
function unlockApp(){
  locked=false; pinBuffer=""; $("lockScreen").classList.add("hidden"); lastActivity=Date.now();
}
$("biometricBtn").onclick=()=>localStorage.getItem("ep_biometric_cred")?unlockWithBiometric():registerBiometric();

function enterPanic(){
  $("panicScreen").classList.remove("hidden");
  $("panicText").focus();
}
function leavePanic(){
  $("panicScreen").classList.add("hidden");
}
$("panicBtn").onclick=enterPanic;
$("panicUnlock").onclick=()=>{
  const code=prompt("Código de saída");
  if(code===localStorage.getItem("ep_panic_code") && code) leavePanic();
  else if(!localStorage.getItem("ep_panic_code")){
    const n=prompt("Crie um código curto para sair do modo disfarce");
    if(n){localStorage.setItem("ep_panic_code",n);leavePanic();}
  }
};

async function renderMessages(){
  const box=$("chat");
  box.innerHTML="";
  const visible=messages.filter(m=>{
    if(!searchText) return true;
    const x=(m.data?.text||"")+" "+(m.data?.senderNick||"");
    return x.toLowerCase().includes(searchText.toLowerCase());
  });
  let previousDay="";
  for(const m of visible){
    const d=m.data;
    const dt=d.createdAt?.toDate?.() || new Date(d.createdAtMs || Date.now());
    const day=dt.toLocaleDateString("pt-BR");
    if(day!==previousDay){
      previousDay=day;
      const sep=document.createElement("div"); sep.className="date-sep"; sep.textContent=day===""+new Date().toLocaleDateString("pt-BR")?"Hoje":day; box.appendChild(sep);
    }
    const row=document.createElement("div");
    row.className="msg-row "+(d.senderUid===me.uid?"mine":"other");
    const bubble=document.createElement("div"); bubble.className="bubble";
    bubble.dataset.id=m.id;
    if(d.senderUid!==me.uid){
      const s=document.createElement("div"); s.className="sender"; s.textContent=d.senderNick||"Outro"; bubble.appendChild(s);
    }
    if(d.reply?.text){
      const r=document.createElement("div"); r.className="reply"; r.textContent=`${d.reply.sender}: ${d.reply.text}`; bubble.appendChild(r);
    }
    if(d.media?.path){
      const mediaBox=document.createElement("div");
      mediaBox.className="media-loading";
      mediaBox.textContent="Carregando mídia cifrada…";
      bubble.appendChild(mediaBox);
      decryptAttachment(d.media, d.senderUid===me.uid ? await getOtherUid() : d.senderUid).then(blob=>{
        mediaBox.remove();
        const url=URL.createObjectURL(blob);
        const el=d.media.type?.startsWith("audio/")?document.createElement("audio"):document.createElement("img");
        if(el.tagName==="IMG"){
          el.className="media";
          el.alt="Imagem";
          el.src=url;
          el.onclick=()=>window.open(url,"_blank","noopener,noreferrer");
        } else {
          el.controls=true;
          el.src=url;
        }
        bubble.insertBefore(el,t);
      }).catch(()=>{mediaBox.textContent="Mídia indisponível neste dispositivo.";});
    }
    const t=document.createElement("div"); t.className="text"; t.textContent=d.text||""; bubble.appendChild(t);

    if(d.reactions){
      const rs=document.createElement("div");rs.className="reactions";
      Object.entries(d.reactions).forEach(([e,c])=>{
        const b=document.createElement("button");b.className="reaction";b.textContent=`${e} ${c}`;b.onclick=()=>react(m.id,e);rs.appendChild(b);
      });
      bubble.appendChild(rs);
    }

    const meta=document.createElement("div");meta.className="meta";
    const time=dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    meta.textContent=time+(d.edited?" · editada":"");
    if(d.senderUid===me.uid){
      const seen=document.createElement("span");seen.textContent=(d.seenBy?.length||0)>1?"✓✓":"✓";seen.style.color=(d.seenBy?.length||0)>1?"#1597d0":"#7c8581";meta.appendChild(seen);
    }
    bubble.appendChild(meta);

    const mb=document.createElement("button");mb.className="msg-menu";mb.textContent="⋮";
    mb.onclick=(e)=>{e.stopPropagation();openMenu(bubble,m);};
    bubble.appendChild(mb);
    row.appendChild(bubble);box.appendChild(row);
  }
  box.scrollTop=box.scrollHeight;
}

function openMenu(bubble,m){
  document.querySelectorAll(".menu").forEach(x=>x.remove());
  const menu=document.createElement("div");menu.className="menu";
  const add=(label,fn)=>{const b=document.createElement("button");b.textContent=label;b.onclick=async e=>{e.stopPropagation();menu.remove();await fn();};menu.appendChild(b);};
  ["❤️","👍","🔥","😂","👏"].forEach(e=>add(e,()=>react(m.id,e)));
  add("Responder",()=>startReply(m));
  if(m.data.senderUid===me.uid) add("Editar",()=>editMessage(m));
  add("Copiar",()=>navigator.clipboard?.writeText(m.data.text||""));
  if(m.data.senderUid===me.uid) add("Apagar",()=>deleteMessage(m));
  bubble.appendChild(menu);
}

function startReply(m){
  replyTarget={id:m.id,sender:m.data.senderNick,text:m.data.text||"[mídia]"};
  $("replyText").textContent=`${replyTarget.sender}: ${replyTarget.text}`;
  $("replyBar").classList.remove("hidden");
  $("messageInput").focus();
}
$("cancelReply").onclick=()=>{$("replyBar").classList.add("hidden");replyTarget=null;};

async function react(id,emoji){
  const m=messages.find(x=>x.id===id); if(!m)return;
  const reactions={...(m.raw.reactions||{})};
  reactions[emoji]=(reactions[emoji]||0)+1;
  await updateDoc(doc(MSGS,id),{reactions}).catch(()=>showToast("Não foi possível reagir."));
}

async function editMessage(m){
  const text=prompt("Editar mensagem:",m.data.text||"");
  if(text===null||!text.trim()||text===m.data.text)return;
  const other=await getOtherUid();
  const body={
    text:text.trim(),
    senderNick:m.data.senderNick||myNick,
    reply:m.data.reply||null,
    media:m.data.media||null,
    reactions:m.data.reactions||{},
    createdAtMs:m.data.createdAtMs||Date.now()
  };
  const payload=await encryptObject(body,other,m.id);
  await updateDoc(doc(MSGS,m.id),{ciphertext:payload.ciphertext,salt:payload.salt,iv:payload.iv,v:payload.v,edited:true}).catch(()=>showToast("Falha ao editar."));
}

async function deleteMessage(m){
  if(!confirm("Apagar esta mensagem para os dois?"))return;
  await deleteDoc(doc(MSGS,m.id)).catch(()=>showToast("Falha ao apagar."));
  if(m.data.media?.path) deleteObject(ref(storage,m.data.media.path)).catch(()=>{});
}

async function encryptAttachment(file, otherUid){
  const max=8*1024*1024;
  if(file.size>max) throw new Error("Para manter o app simples, anexos ficam limitados a 8 MB.");
  const plain=await file.arrayBuffer();
  const secret=await getSharedSecret(otherUid);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveMessageKey(secret,salt);
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
  return {cipher:new Uint8Array(cipher),salt:b64(salt),iv:b64(iv),type:file.type,name:file.name};
}

async function decryptAttachment(media,otherUid){
  const cipher=await getBytes(ref(storage,media.path));
  const secret=await getSharedSecret(otherUid);
  const key=await deriveMessageKey(secret,unb64(media.salt));
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(media.iv)},key,cipher);
  return new Blob([plain],{type:media.type||"application/octet-stream"});
}

async function sendMessage(){
  const input=$("messageInput");
  const text=input.value.trim();
  if(!text && !selectedFile)return;
  const other=await getOtherUid();
  if(!other) return showToast("A outra pessoa ainda não está pareada.");
  const id=randomId(18);
  let media=null;
  try{
    if(selectedFile){
      const e=await encryptAttachment(selectedFile,other);
      const path=`private/${ROOM_ID}/media/${id}.bin`;
      await uploadBytes(ref(storage,path),e.cipher,{contentType:"application/octet-stream",cacheControl:"no-store"});
      media={path,type:e.type,name:e.name,salt:e.salt,iv:e.iv};
    }
    const body={
      text,
      senderNick:myNick,
      reply:replyTarget?{sender:replyTarget.sender,text:replyTarget.text}:null,
      media,
      reactions:{},
      createdAtMs:Date.now()
    };
    const encrypted=await encryptObject(body,other,id);
    await setDoc(doc(MSGS,id),{
      senderUid:me.uid,
      senderNick:myNick,
      ciphertext:encrypted.ciphertext,
      salt:encrypted.salt,
      iv:encrypted.iv,
      v:encrypted.v,
      createdAt:serverTimestamp(),
      createdAtMs:Date.now(),
      seenBy:[me.uid],
      edited:false,
      reactions:{}
    });
    input.value="";
    input.style.height="auto";
    selectedFile=null;
    $("fileInput").value="";
    $("sendBtn").textContent="➤";
    $("replyBar").classList.add("hidden"); replyTarget=null;
    await saveStatus(false);
  }catch(e){console.error(e);showToast(e.message||"Não foi possível enviar.");}
}

async function decryptMessages(raw){
  const other=await getOtherUid();
  const out=[];
  for(const d of raw){
    try{
      const body=await decryptObject(d, d.senderUid===me.uid?other:d.senderUid, d.id);
      body.seenBy=d.seenBy||[];
      body.senderUid=d.senderUid;
      body.senderNick=d.senderNick;
      body.createdAt=d.createdAt;
      body.createdAtMs=d.createdAtMs;
      body.edited=d.edited;
      body.reactions=d.reactions||{};
      out.push({id:d.id,data:body,raw:d});
    }catch(e){
      out.push({id:d.id,data:{text:"[mensagem não disponível neste dispositivo]",senderUid:d.senderUid,senderNick:d.senderNick,createdAt:d.createdAt,createdAtMs:d.createdAtMs,seenBy:d.seenBy||[]},raw:d});
    }
  }
  return out;
}

function listenKeys(){
  unsubscribeKeys?.();
  unsubscribeKeys=onSnapshot(KEYS,snap=>{
    keyCache=new Map();
    snap.forEach(d=>keyCache.set(d.id,d.data()));
    sharedSecretCache.clear();
    const other=[...keyCache.keys()].find(x=>x!==me.uid);
    $("status").textContent=keyCache.has(other)?"Conexão cifrada • "+(keyCache.get(other).nick||"online"):"Aguardando o outro dispositivo…";
  });
}

function listenMessages(){
  unsubscribeMessages?.();
  const q=query(MSGS,orderBy("createdAtMs","asc"),limit(500));
  unsubscribeMessages=onSnapshot(q,async snap=>{
    const raw=[];snap.forEach(d=>raw.push({id:d.id,...d.data()}));
    messages=await decryptMessages(raw);
    await renderMessages();
    markSeen();
    expireOldMessages();
  },e=>showToast("Falha na sincronização."));
}

async function markSeen(){
  for(const m of messages){
    if(m.data.senderUid!==me.uid && !(m.data.seenBy||[]).includes(me.uid)){
      updateDoc(doc(MSGS,m.id),{seenBy:arrayUnion(me.uid)}).catch(()=>{});
    }
  }
}

async function expireOldMessages(){
  if(!ttlSeconds)return;
  const now=Date.now();
  for(const m of messages){
    const t=m.data.createdAtMs||0;
    if(t && now-t>ttlSeconds*1000 && m.raw?.senderUid===me.uid) deleteMessage(m);
  }
}

function listenStatus(){
  unsubscribeStatus?.();
  unsubscribeStatus=onSnapshot(STATUS,snap=>{
    const other=[...snap.docs].map(d=>d.data()).find(x=>x.uid!==me.uid);
    if(!other){$("status").textContent="Conversa cifrada";return;}
    const active=other.lastActive?.toMillis ? Date.now()-other.lastActive.toMillis()<90000 : false;
    $("status").textContent=other.typing?"está a escrever…":(active?"online":"offline");
  });
}

async function start(){
  await verifyMembership();
  await ensureIdentity();
  $("myAvatar").textContent=initials(myNick);
  $("authScreen").classList.add("hidden");
  $("header").classList.remove("hidden");
  $("footer").classList.remove("hidden");
  listenKeys();listenMessages();listenStatus();
  await saveStatus(false);
  await loadPin();
  setupPinpad();
  $("biometricBtn").textContent=localStorage.getItem("ep_biometric_cred")?"Desbloquear com biometria":"Ativar biometria deste dispositivo";
  if(!pinReady){
    showToast("Crie um PIN de 6 dígitos para proteger este dispositivo.");
    $("lockScreen").classList.remove("hidden");
  }
}

let startingSession = false;

$("authForm").onsubmit=async e=>{
  e.preventDefault();
  $("authError").textContent="";
  const email=$("email").value.trim();
  const password=$("password").value;
  const nickname=$("nickname").value.trim();
  if(!nickname){
    $("authError").textContent="Informe um nome/apelido para este dispositivo.";
    return;
  }
  // Guardamos o apelido temporariamente porque o Firebase concluirá o login
  // de forma assíncrona e onAuthStateChanged será o único ponto que inicia a sessão.
  sessionStorage.setItem("ep_pending_nick", nickname);
  try{
    await signInWithEmailAndPassword(auth,email,password);
  }catch(err){
    sessionStorage.removeItem("ep_pending_nick");
    console.error(err);
    $("authError").textContent=err.code==="auth/invalid-credential"?"E-mail ou senha inválidos.":(err.message||"Não foi possível entrar.");
  }
};

onAuthStateChanged(auth,async user=>{
  if(!user){
    me=null;
    return;
  }
  if(startingSession || me?.uid===user.uid) return;
  startingSession=true;
  me=user;
  const pendingNick=sessionStorage.getItem("ep_pending_nick")||"";
  myNick=pendingNick||localStorage.getItem("ep_nick_"+me.uid)||"";
  if(!myNick){
    startingSession=false;
    me=null;
    await signOut(auth).catch(()=>{});
    $("authScreen").classList.remove("hidden");
    return;
  }
  localStorage.setItem("ep_nick_"+me.uid,myNick);
  sessionStorage.removeItem("ep_pending_nick");
  try{
    await start();
  }catch(e){
    console.error("Falha ao iniciar sessão segura:",e);
    const msg=e?.message||"Não foi possível iniciar a sessão segura.";
    me=null;
    startingSession=false;
    await signOut(auth).catch(()=>{});
    $("authScreen").classList.remove("hidden");
    $("authError").textContent="Não foi possível iniciar a sessão segura: "+msg;
  }
  startingSession=false;
});

$("sendBtn").onclick=sendMessage;
$("messageInput").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}
});
$("messageInput").addEventListener("input",()=>{
  const x=$("messageInput");x.style.height="auto";x.style.height=Math.min(x.scrollHeight,120)+"px";saveStatus(true);clearTimeout(window.typingTimer);window.typingTimer=setTimeout(()=>saveStatus(false),2500);
});
$("attachBtn").onclick=()=>$("fileInput").click();
$("fileInput").onchange=e=>{
  selectedFile=e.target.files?.[0]||null;
  if(selectedFile)showToast(`${selectedFile.name} pronto para envio cifrado.`);
};
$("emojiBtn").onclick=()=>{
  const p=$("emojiPanel");p.classList.toggle("hidden");
  if(!p.innerHTML)p.innerHTML=EMOJIS.map(e=>`<button type="button">${e}</button>`).join("");
  p.querySelectorAll("button").forEach(b=>b.onclick=()=>{$("messageInput").setRangeText(b.textContent,$("messageInput").selectionStart,$("messageInput").selectionEnd,"end");$("messageInput").focus();});
};
$("searchBtn").onclick=()=>$("searchBar").classList.toggle("hidden");
$("searchInput").oninput=e=>{searchText=e.target.value;renderMessages();};

$("settingsBtn").onclick=()=>{
  $("settingsModal").classList.remove("hidden");
  $("autoLock").checked=localStorage.getItem("ep_auto_lock")==="1";
  $("safeNotifications").checked=localStorage.getItem("ep_safe_notifications")!=="0";
  $("ttl").value=String(ttlSeconds);
};
$("closeSettings").onclick=()=>$("settingsModal").classList.add("hidden");
$("autoLock").onchange=e=>localStorage.setItem("ep_auto_lock",e.target.checked?"1":"0");
$("safeNotifications").onchange=e=>localStorage.setItem("ep_safe_notifications",e.target.checked?"1":"0");
$("ttl").onchange=e=>{ttlSeconds=Number(e.target.value);localStorage.setItem("ep_ttl",String(ttlSeconds));};
$("hideNow").onclick=()=>{ $("settingsModal").classList.add("hidden");enterPanic(); };
$("logoutBtn").onclick=async()=>{await saveStatus(false);unsubscribeMessages?.();unsubscribeKeys?.();unsubscribeStatus?.();await signOut(auth);location.reload();};

$("pinned").onclick=()=>{};
document.addEventListener("click",()=>document.querySelectorAll(".menu").forEach(x=>x.remove()));

window.addEventListener("visibilitychange",()=>{
  if(document.hidden) saveStatus(false);
  else {updateActivity();markSeen();}
});
window.addEventListener("pagehide",()=>saveStatus(false));

if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
