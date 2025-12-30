const music = document.getElementById("menuMusic");
const playBtn = document.getElementById("playBtn");
const musicBtn = document.getElementById("musicBtn");

music.volume = 0.5;

// ▶️ JOGAR
playBtn.addEventListener("click", () => {
  music.pause(); // para música do menu
  music.currentTime = 0;

  window.location.href = "game.html";
});

// 🎧 OUVIR MÚSICA
musicBtn.addEventListener("click", () => {
  music.play().then(() => {
    console.log("🎵 música do menu tocando");
  }).catch(() => {
    console.log("🔒 navegador bloqueou até interação válida");
  });
});
