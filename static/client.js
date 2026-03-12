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

// Variables globales para el manejo de video y conexiones múltiples
let localStream = null;
let peerConnections = {}; // Diccionario para gestionar una conexión por cada usuario
let audioEnabled = true;
let videoEnabled = true;

// Configuración de servidor STUN para comunicar navegadores a través de internet
const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Registro y Entrada 
btnEntrar.onclick = () => {
    const nombre = document.getElementById("nombre").value;
    const sala = document.getElementById("sala").value;
    if(!nombre || !sala) return alert("Pon tu nombre y sala");
    
    // Enviamos los datos al servidor para que nos asigne una sala lógica
    socket.emit("register", { nombre, sala, sid: socket.id });
};

// Lógica de Emojis 
const emojis = ["😀", "😂", "😎", "😍", "🙌", "🔥", "💯", "👍", "🚀", "💻", "✨", "🎉", "🤔", "👀", "👋"];

// Genera visualmente los emojis en el panel
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

// Control para mostrar u ocultar el selector de emojis
btnEmoji.onclick = (e) => {
    e.stopPropagation();
    emojiPicker.style.display = emojiPicker.style.display === "grid" ? "none" : "grid";
};

document.onclick = () => { emojiPicker.style.display = "none"; };

// Control de Cámara y Micrófono) 
btnCamara.onclick = async () => {
    try {
        // Solicita acceso de cámara y audio al cliente
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoLocal.srcObject = localStream;
        btnCamara.disabled = true;
        btnCamara.innerText = "Cámara Activa ✅";
        btnMute.style.display = "inline-block";
        btnVideoOff.style.display = "inline-block";
    } catch (e) {
        alert("No se pudo acceder a la cámara");
    }
};

// Apaga o prende el audio del flujo local
btnMute.onclick = () => {
    audioEnabled = !audioEnabled;
    localStream.getAudioTracks()[0].enabled = audioEnabled;
    btnMute.innerText = audioEnabled ? "Silenciar Micrófono 🎙️" : "Activar Micrófono 🔇";
    btnMute.style.background = audioEnabled ? "#4CAF50" : "#f44336";
};

// Apaga o prende el video del flujo local
btnVideoOff.onclick = () => {
    videoEnabled = !videoEnabled;
    localStream.getVideoTracks()[0].enabled = videoEnabled;
    btnVideoOff.innerText = videoEnabled ? "Apagar Cámara 📷" : "Encender Cámara 🚫";
    btnVideoOff.style.background = videoEnabled ? "#4CAF50" : "#f44336";
};

// WebRTC Mesh Conexiones Punto a Punto

// Cuando el servidor avisa que alguien entró, iniciamos una conexión directa con él
socket.on("user_joined", data => {
    if (localStream) crearPeer(data.sid, true);
});

function crearPeer(remoteSid, isInitiator) {
    // Crea la conexión Punto a punto para un usuario específico
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[remoteSid] = pc;
    
    // Agregamos nuestro video y audio a esta conexión
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Intercambio de candidatos de red a través del servidor de Sockets
    pc.onicecandidate = e => {
        if (e.candidate) {
            socket.emit("webrtc_candidate", { candidate: e.candidate, target: remoteSid });
        }
    };

    // Cuando recibimos el video de la otra persona, lo ponemos en un elemento nuevo
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

    // Si somos los que iniciamos, creamos la oferta técnica de video 
    if (isInitiator) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit("webrtc_offer", { offer, target: remoteSid });
        });
    }
}

// Escucha del socket para recibir ofertas de video de otros usuarios
socket.on("webrtc_offer", async data => {
    if (!localStream) return;
    const remoteSid = data.from;
    crearPeer(remoteSid, false);
    await peerConnections[remoteSid].setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnections[remoteSid].createAnswer();
    await peerConnections[remoteSid].setLocalDescription(answer);
    socket.emit("webrtc_answer", { answer, target: remoteSid });
});

// Escucha del socket para recibir respuestas a nuestras ofertas
socket.on("webrtc_answer", async data => {
    await peerConnections[data.from].setRemoteDescription(new RTCSessionDescription(data.answer));
});

// Escucha del socket para recibir datos de red de los otros usuarios
socket.on("webrtc_candidate", async data => {
    if (peerConnections[data.from]) {
        await peerConnections[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Limpieza de la conexión cuando un usuario se desconecta
socket.on("user_left", data => {
    if (peerConnections[data.sid]) {
        peerConnections[data.sid].close();
        delete peerConnections[data.sid];
        const v = document.getElementById(`video_${data.sid}`);
        if (v) v.remove();
    }
});

// Chat Cliente-Servidor

// Envía el mensaje al servidor para que lo reparta a la sala
btnEnviar.onclick = () => {
    const msg = mensajeInput.value;
    if(msg) {
        socket.emit("send_message", { mensaje: msg });
        mensajeInput.value = "";
    }
};

// Recibe mensajes de otros usuarios a través del servidor
socket.on("receive_message", data => {
    chat.innerHTML += `<p><b>${data.nombre}:</b> ${data.mensaje}</p>`;
    chat.scrollTop = chat.scrollHeight;
});

// Mensajes del sistema (entradas y salidas de usuarios)
socket.on("system", msg => {
    chat.innerHTML += `<p style="color: #888; font-size: 0.9em;"><i>${msg}</i></p>`;
});