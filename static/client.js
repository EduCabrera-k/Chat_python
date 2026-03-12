// Conexión inicial con el servidor mediante Sockets
const socket = io();

// Referencias a los elementos de la interfaz (HTML)
const chat = document.getElementById("chat");
const btnEntrar = document.getElementById("btnEntrar");
const btnEnviar = document.getElementById("btnEnviar");
const btnCamara = document.getElementById("btnCamara");
const btnMute = document.getElementById("btnMute");
const btnVideoOff = document.getElementById("btnVideoOff");
const mensajeInput = document.getElementById("mensaje");
const videoLocal = document.getElementById("videoLocal");
const contenedorVideos = document.getElementById("videos");
const emojiPicker = document.getElementById("emojiPicker");
const btnEmoji = document.getElementById("btnEmoji");

// Variables globales
let localStream = null;
let peerConnections = {}; 
let audioEnabled = true;
let videoEnabled = true;

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// --- REGISTRO Y ENTRADA ---
btnEntrar.onclick = () => {
    const nombre = document.getElementById("nombre").value;
    const sala = document.getElementById("sala").value;
    if(!nombre || !sala) return alert("Pon tu nombre y sala");
    
    // IMPORTANTE: Entramos a la sala siempre, tengamos cámara o no
    socket.emit("register", { nombre, sala, sid: socket.id });
    btnEntrar.disabled = true;
    btnEntrar.innerText = "Dentro de la Sala ✅";
};

// --- LÓGICA DE EMOJIS ---
const emojis = ["😀", "😂", "😎", "😍", "🙌", "🔥", "💯", "👍", "🚀", "💻", "✨", "🎉", "🤔", "👀", "👋"];
emojis.forEach(emoji => {
    const span = document.createElement("span");
    span.innerText = emoji;
    span.onclick = () => {
        mensajeInput.value += emoji;
        emojiPicker.style.display = "none"; 
        mensajeInput.focus();
    };
    emojiPicker.appendChild(span);
});

btnEmoji.onclick = (e) => {
    e.stopPropagation();
    emojiPicker.style.display = emojiPicker.style.display === "grid" ? "none" : "grid";
};
document.onclick = () => { emojiPicker.style.display = "none"; };

// --- CONTROL DE CÁMARA ---
btnCamara.onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoLocal.srcObject = localStream;
        btnCamara.disabled = true;
        btnCamara.innerText = "Cámara Activa ✅";
        btnMute.style.display = "inline-block";
        btnVideoOff.style.display = "inline-block";

        // Si ya estamos en una llamada, avisamos que ahora sí tenemos video
        Object.values(peerConnections).forEach(pc => {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        });
    } catch (e) {
        alert("No se pudo acceder a la cámara, entrarás como espectador.");
    }
};

btnMute.onclick = () => {
    audioEnabled = !audioEnabled;
    localStream.getAudioTracks()[0].enabled = audioEnabled;
    btnMute.innerText = audioEnabled ? "Silenciar Micrófono 🎙️" : "Activar Micrófono 🔇";
    btnMute.style.background = audioEnabled ? "#4CAF50" : "#f44336";
};

btnVideoOff.onclick = () => {
    videoEnabled = !videoEnabled;
    localStream.getVideoTracks()[0].enabled = videoEnabled;
    btnVideoOff.innerText = videoEnabled ? "Apagar Cámara 📷" : "Encender Cámara 🚫";
    btnVideoOff.style.background = videoEnabled ? "#4CAF50" : "#f44336";
};

// --- WebRTC LÓGICA MESH ---

socket.on("user_joined", data => {
    // FIX: Ahora creamos el Peer aunque localStream sea null
    crearPeer(data.sid, true);
});

function crearPeer(remoteSid, isInitiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[remoteSid] = pc;
    
    // FIX: Solo agregamos tracks si la cámara está encendida
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = e => {
        if (e.candidate) {
            socket.emit("webrtc_candidate", { candidate: e.candidate, target: remoteSid });
        }
    };

    pc.ontrack = e => {
        let remoteVid = document.getElementById(`video_${remoteSid}`);
        if (!remoteVid) {
            remoteVid = document.createElement("video");
            remoteVid.id = `video_${remoteSid}`;
            remoteVid.autoplay = true;
            remoteVid.playsinline = true;
            contenedorVideos.appendChild(remoteVid);
        }
        remoteVid.srcObject = e.streams[0];
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit("webrtc_offer", { offer, target: remoteSid });
        });
    }
}

socket.on("webrtc_offer", async data => {
    // FIX: Quitamos el 'return' si no hay localStream
    const remoteSid = data.from;
    crearPeer(remoteSid, false);
    await peerConnections[remoteSid].setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnections[remoteSid].createAnswer();
    await peerConnections[remoteSid].setLocalDescription(answer);
    socket.emit("webrtc_answer", { answer, target: remoteSid });
});

socket.on("webrtc_answer", async data => {
    if(peerConnections[data.from]) {
        await peerConnections[data.from].setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on("webrtc_candidate", async data => {
    if (peerConnections[data.from]) {
        await peerConnections[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

socket.on("user_left", data => {
    if (peerConnections[data.sid]) {
        peerConnections[data.sid].close();
        delete peerConnections[data.sid];
        const v = document.getElementById(`video_${data.sid}`);
        if (v) v.remove();
    }
});

// --- CHAT ---
btnEnviar.onclick = () => {
    const msg = mensajeInput.value;
    if(msg) {
        socket.emit("send_message", { mensaje: msg });
        mensajeInput.value = "";
    }
};

socket.on("receive_message", data => {
    chat.innerHTML += `<p><b>${data.nombre}:</b> ${data.mensaje}</p>`;
    chat.scrollTop = chat.scrollHeight;
});

socket.on("system", msg => {
    chat.innerHTML += `<p style="color: #888; font-size: 0.9em;"><i>${msg}</i></p>`;
});