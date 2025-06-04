document.addEventListener("DOMContentLoaded", function () {
  const url = new URL(window.location.href);

  const urlParams = new URLSearchParams(window.location.search);
  const seek = urlParams.get("seek");
  const jwt = urlParams.get("jwt");

  const pathSegments = url.pathname.split("/");
  const location = pathSegments[2];
  const bucketID = pathSegments[3];
  const fileID = pathSegments[4];

  var videoSrc;
  if (jwt) {
    videoSrc = `https://assets.zustack.com/private/${location}/${bucketID}/${fileID}/master.m3u8?jwt=${jwt}`;
  } else {
    videoSrc = `https://assets.zustack.com/public/${location}/${bucketID}/${fileID}/master.m3u8`;
  }

  const video = document.querySelector("#player");

  var videoPosterUrl;
  if (jwt) {
    videoPosterUrl = `https://assets.zustack.com/private/${location}/${bucketID}/${fileID}/thumbnail.webp?jwt=${jwt}`;
  } else {
    videoPosterUrl = `https://assets.zustack.com/public/${location}/${bucketID}/${fileID}/thumbnail.webp`;
  }
  video.poster = videoPosterUrl;

  let hls;
  var thumbnail_width = 300;

  const generateSeekUrls = (bucketID, fileID, count, jwt) => {
    const urls = [];

    for (let i = 1; i <= count; i++) {
      const seekNumber = i.toString().padStart(3, "0");

      if (jwt) {
        urls.push(
          `https://assets.zustack.com/private/${location}/${bucketID}/${fileID}/seek_${seekNumber}.jpg?jwt=${jwt}`
        );
      } else {
        urls.push(
          `https://assets.zustack.com/public/${location}/${bucketID}/${fileID}/seek_${seekNumber}.jpg`
        );
      }
    }
    return urls;
  };

  var seek_thumbnail_config = {
    enabled: seek,
    pic_num: seek,
    width: thumbnail_width,
    height: (thumbnail_width * 9) / 16,
    col: 6,
    row: 6,
    offsetX: 0,
    offsetY: 0,
    urls: generateSeekUrls(bucketID, fileID, Math.ceil(seek / 36), jwt),
  };

  function getSeekThumbnailHeight(imgWidth, imgHeight) {
    var aspectRatio = imgWidth / imgHeight;
    return Math.floor(thumbnail_width / aspectRatio);
  }

  var prevShowImage = null;
  function setSeekThumbnailHeight(player) {
    if (prevShowImage || !player || !player.thumbnails) return;

    prevShowImage = player.thumbnails.showImage;

    player.thumbnails.showImage = function (
      previewImage,
      qualityIndex,
      thumbNum,
      thumbFilename,
      newImage
    ) {
      if (previewImage.width > 0 && previewImage.height > 0)
        player.config.thumbnail.height = getSeekThumbnailHeight(
          previewImage.width,
          previewImage.height
        );
      prevShowImage.call(
        player.thumbnails,
        previewImage,
        qualityIndex,
        thumbNum,
        thumbFilename,
        newImage
      );
    };
  }

  // Configuración del reproductor
  const defaultOptions = {
    quality: {
      default: 720,
      options: [2160, 1440, 1080, 720, 480, 360],
      forced: true,
      onChange: (quality) => updateQuality(quality),
    },
    captions: {
      active: true,
      update: true,
    },
    tooltips: {
      controls: true,
      seek: true,
    },
    keyboard: {
      focused: true,
      global: true,
    },
    controls: [
      "play-large",
      "rewind",
      "play",
      "fast-forward",
      "progress",
      "current-time",
      "duration",
      "mute",
      "volume",
      "captions",
      "settings",
      "pip",
      "airplay",
      "fullscreen",
    ],
    settings: ["captions", "quality", "speed"],
    speed: {
      selected: 1,
      options: [0.5, 0.75, 1, 1.25, 1.5, 2],
    },
    storage: {
      enabled: true,
      key: "plyr-settings",
    },
    thumbnail: seek_thumbnail_config,
  };

  function updateQuality(newQuality) {
    if (hls) {
      const levels = hls.levels;
      const level = levels.findIndex((level) => level.height === newQuality);
      if (level !== -1) {
        hls.currentLevel = level;
      }
    }
  }

  // Comprobar si HLS es soportado
  if (Hls.isSupported()) {

    const hlsConfig = {
      xhrSetup: function (xhr, _) {
        xhr.setRequestHeader("Authorization", "Bearer " + jwt);
      },
      debug: false,
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      initialLiveManifestSize: 1,
    };

    hls = new Hls(hlsConfig);
    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, function () {
      console.log("HLS: Media attached");
      hls.loadSource(videoSrc);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
      console.log(
        "HLS: Manifest parsed, found " + data.levels.length + " quality levels"
      );

      const qualities = data.levels.map((level) => level.height);
      defaultOptions.quality.options = [...new Set(qualities)].sort(
        (a, b) => b - a
      );

      const player = new Plyr(video, defaultOptions);

      player.on("ready", function () {
        setSeekThumbnailHeight(player);
      });

      player.on("qualitychange", (event) => {
        const quality = event.detail.quality;
        updateQuality(quality);
      });

      player.on("loadedmetadata", function () {
        setSeekThumbnailHeight(player);
      });
    });

    hls.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log("Fatal network error encountered, trying to recover");
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log("Fatal media error encountered, trying to recover");
            hls.recoverMediaError();
            break;
          default:
            console.log("Fatal error, cannot recover");
            hls.destroy();
            break;
        }
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = videoSrc;
    const player = new Plyr(video, defaultOptions);

    player.on("ready", function () {
      setSeekThumbnailHeight(player);
    });
  } else {
    console.error("HLS is not supported in this browser");
  }
});
