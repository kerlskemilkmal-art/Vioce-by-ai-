// Studio.AI - Interactive Studio Dashboard Engine

document.addEventListener("DOMContentLoaded", () => {
    
    // ==========================================
    // 1. GLOBAL UI & TAB NAVIGATION
    // ==========================================
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    
    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");
            
            navButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));
            
            btn.classList.add("active");
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add("active");
            
            // Stop any playing audio when changing workspaces
            stopAllAudio();
        });
    });

    // Character counter for TTS text area
    const ttsTextarea = document.getElementById("tts-text");
    const charCountSpan = document.getElementById("char-count");
    if (ttsTextarea && charCountSpan) {
        ttsTextarea.addEventListener("input", () => {
            charCountSpan.textContent = ttsTextarea.value.length;
        });
    }

    // Slider value trackers
    const noiseSlider = document.getElementById("noise-strength");
    const strengthValSpan = document.getElementById("strength-val");
    if (noiseSlider && strengthValSpan) {
        noiseSlider.addEventListener("input", (e) => {
            strengthValSpan.textContent = Math.round(e.target.value * 100) + "%";
        });
    }

    // ==========================================
    // 2. LOADING OVERLAY MODAL SYSTEM
    // ==========================================
    const overlay = document.getElementById("processing-overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlaySubtitle = document.getElementById("overlay-subtitle");
    const overlayProgress = document.getElementById("overlay-progress");
    const overlayPercent = document.getElementById("overlay-percent");

    function showLoading(title, subtitle) {
        overlayTitle.textContent = title;
        overlaySubtitle.textContent = subtitle;
        overlayProgress.style.width = "0%";
        overlayPercent.textContent = "0%";
        overlay.classList.add("show");
    }

    function updateLoadingProgress(percent) {
        overlayProgress.style.width = `${percent}%`;
        overlayPercent.textContent = `${percent}%`;
    }

    function hideLoading() {
        overlay.classList.remove("show");
    }

    // ==========================================
    // 3. AUDIO PLAYBACK & REAL-TIME VISUALIZERS
    // ==========================================
    let ttsAudio = null;
    let ttsBlobUrl = null;
    let ttsPlayInterval = null;
    let ttsWaveformPoints = [];

    let enhanceAudioOriginal = null;
    let enhanceAudioEnhanced = null;
    let activeEnhanceAudio = null; // Currently selected comparison source
    let originalBlobUrl = null;
    let enhancedBlobUrl = null;
    let enhancePlayInterval = null;
    let enhanceWaveformPoints = [];

    let transcribeAudio = null;
    let transcribeBlobUrl = null;
    let transcriptionSegments = [];
    let transcribePlayInterval = null;

    function stopAllAudio() {
        if (ttsAudio) {
            ttsAudio.pause();
            ttsAudio.currentTime = 0;
            resetPlayerUI("tts");
        }
        if (enhanceAudioOriginal) { enhanceAudioOriginal.pause(); }
        if (enhanceAudioEnhanced) { enhanceAudioEnhanced.pause(); }
        if (activeEnhanceAudio) {
            activeEnhanceAudio.pause();
            activeEnhanceAudio.currentTime = 0;
            resetPlayerUI("enhance");
        }
        if (transcribeAudio) {
            transcribeAudio.pause();
            transcribeAudio.currentTime = 0;
            clearInterval(transcribePlayInterval);
        }
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // Helper to generate dynamic aesthetic waveform shapes
    function generateMockWaveform(pointsCount = 60) {
        const points = [];
        for (let i = 0; i < pointsCount; i++) {
            // Curate smooth mountain-like amplitudes using multi-sine curves
            const baseAmp = Math.sin((i / pointsCount) * Math.PI) * 0.7;
            const noise = (Math.sin((i / pointsCount) * Math.PI * 8) * 0.15) + (Math.random() * 0.08);
            points.push(Math.max(0.05, baseAmp + noise));
        }
        return points;
    }

    // Renders the glowing sound waves onto Canvas with a moving playhead
    function drawWaveform(canvasId, points, progress = 0, isEnhanced = false) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        
        // Match drawing buffer to scale properly on Retina screens
        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, width, height);

        const barWidth = 3;
        const gap = 2;
        const totalBars = Math.floor(width / (barWidth + gap));
        
        // Scale input points to fit canvas bars
        let waveData = points;
        if (points.length === 0) return;

        ctx.shadowBlur = 0;
        
        for (let i = 0; i < totalBars; i++) {
            const pointIdx = Math.floor((i / totalBars) * waveData.length);
            const amplitude = waveData[pointIdx] || 0.1;
            const barHeight = amplitude * (height * 0.75);
            const x = i * (barWidth + gap);
            const y = (height - barHeight) / 2;

            const isPassed = (i / totalBars) <= progress;

            if (isPassed) {
                // Colored active visualizer slices
                if (isEnhanced) {
                    ctx.fillStyle = "#05c46b"; // Green for cleaned audio
                } else {
                    ctx.fillStyle = "#00f2fe"; // Neon Cyan-Blue gradient approximation
                }
            } else {
                ctx.fillStyle = "#2c2c35"; // Neutral background waves
            }

            // Draw rounded audio bars
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
        }

        // Draw vertical playhead glow line
        const cursorX = progress * width;
        ctx.shadowColor = isEnhanced ? "#05c46b" : "#00f2fe";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cursorX - 1, 0, 2, height);
        ctx.shadowBlur = 0;
    }

    function resetPlayerUI(prefix) {
        const playBtn = document.getElementById(`btn-${prefix}-play`);
        const pauseBtn = document.getElementById(`btn-${prefix}-pause`);
        const timeline = document.getElementById(`${prefix}-timeline`);
        const currentTimeSpan = document.getElementById(`${prefix}-current-time`);
        
        if (playBtn) playBtn.style.display = "flex";
        if (pauseBtn) pauseBtn.style.display = "none";
        if (timeline) timeline.value = 0;
        if (currentTimeSpan) currentTimeSpan.textContent = "0:00";
        
        clearInterval(prefix === "tts" ? ttsPlayInterval : enhancePlayInterval);
    }

    // ==========================================
    // 4. MODULE 1: TEXT-TO-SPEECH (TTS)
    // ==========================================
    const btnGenerateTTS = document.getElementById("btn-generate-tts");
    const ttsWaveformPlaceholder = document.getElementById("tts-waveform-placeholder");
    const btnTTSPlay = document.getElementById("btn-tts-play");
    const btnTTSPause = document.getElementById("btn-tts-pause");
    const btnTTSStop = document.getElementById("btn-tts-stop");
    const ttsTimeline = document.getElementById("tts-timeline");
    const ttsCurrentTimeText = document.getElementById("tts-current-time");
    const ttsDurationText = document.getElementById("tts-duration");
    const btnTTSDownload = document.getElementById("btn-tts-download");

    btnGenerateTTS.addEventListener("click", async () => {
        const text = ttsTextarea.value.trim();
        if (!text) {
            alert("Please type some text before generating.");
            return;
        }

        stopAllAudio();
        showLoading("Synthesizing Script", "Calling Deep Neural Voice Generator...");
        updateLoadingProgress(25);

        const voiceKey = document.getElementById("tts-voice").value;
        const rate = document.getElementById("tts-rate").value;

        try {
            updateLoadingProgress(55);
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice_key: voiceKey, rate })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Server error.");
            }

            updateLoadingProgress(85);
            const audioBlob = await response.blob();
            
            // Clean up previous blob URLs
            if (ttsBlobUrl) URL.revokeObjectURL(ttsBlobUrl);
            
            ttsBlobUrl = URL.createObjectURL(audioBlob);
            ttsAudio = new Audio(ttsBlobUrl);
            
            // Generate visual waveform coordinates
            ttsWaveformPoints = generateMockWaveform(75);
            
            ttsAudio.addEventListener("loadedmetadata", () => {
                hideLoading();
                ttsDurationText.textContent = formatTime(ttsAudio.duration);
                ttsTimeline.max = Math.floor(ttsAudio.duration);
                
                // Enable audio controls
                btnTTSPlay.disabled = false;
                btnTTSStop.disabled = false;
                ttsTimeline.disabled = false;
                ttsWaveformPlaceholder.style.display = "none";
                
                // Show download link
                btnTTSDownload.href = ttsBlobUrl;
                btnTTSDownload.download = "studio_voiceover.mp3";
                btnTTSDownload.style.visibility = "visible";
                
                drawWaveform("tts-waveform-canvas", ttsWaveformPoints, 0);
            });

            ttsAudio.addEventListener("ended", () => {
                resetPlayerUI("tts");
                drawWaveform("tts-waveform-canvas", ttsWaveformPoints, 0);
            });

        } catch (error) {
            hideLoading();
            alert(`TTS Error: ${error.message}`);
        }
    });

    // TTS Player Button Listeners
    btnTTSPlay.addEventListener("click", () => {
        if (!ttsAudio) return;
        ttsAudio.play();
        btnTTSPlay.style.display = "none";
        btnTTSPause.style.display = "flex";
        
        ttsPlayInterval = setInterval(() => {
            ttsTimeline.value = ttsAudio.currentTime;
            ttsCurrentTimeText.textContent = formatTime(ttsAudio.currentTime);
            const progress = ttsAudio.currentTime / ttsAudio.duration;
            drawWaveform("tts-waveform-canvas", ttsWaveformPoints, progress);
        }, 100);
    });

    btnTTSPause.addEventListener("click", () => {
        if (!ttsAudio) return;
        ttsAudio.pause();
        btnTTSPause.style.display = "none";
        btnTTSPlay.style.display = "flex";
        clearInterval(ttsPlayInterval);
    });

    btnTTSStop.addEventListener("click", () => {
        if (!ttsAudio) return;
        ttsAudio.pause();
        ttsAudio.currentTime = 0;
        resetPlayerUI("tts");
        drawWaveform("tts-waveform-canvas", ttsWaveformPoints, 0);
    });

    ttsTimeline.addEventListener("input", (e) => {
        if (!ttsAudio) return;
        ttsAudio.currentTime = e.target.value;
        ttsCurrentTimeText.textContent = formatTime(ttsAudio.currentTime);
        const progress = ttsAudio.currentTime / ttsAudio.duration;
        drawWaveform("tts-waveform-canvas", ttsWaveformPoints, progress);
    });

    // ==========================================
    // 5. MODULE 2: AUDIO ENHANCER & DENOISER
    // ==========================================
    const enhanceDropzone = document.getElementById("enhance-dropzone");
    const enhanceFileInput = document.getElementById("enhance-file-input");
    const fileInfoContainer = document.getElementById("file-info-container");
    const loadedFilename = document.getElementById("loaded-filename");
    const loadedFilesize = document.getElementById("loaded-filesize");
    const btnRemoveFile = document.getElementById("btn-remove-file");
    const btnProcessEnhance = document.getElementById("btn-process-enhance");

    const btnToggleOriginal = document.getElementById("btn-toggle-original");
    const btnToggleEnhanced = document.getElementById("btn-toggle-enhanced");
    const enhanceWaveformPlaceholder = document.getElementById("enhance-waveform-placeholder");
    const btnEnhancePlay = document.getElementById("btn-enhance-play");
    const btnEnhancePause = document.getElementById("btn-enhance-pause");
    const btnEnhanceStop = document.getElementById("btn-enhance-stop");
    const enhanceTimeline = document.getElementById("enhance-timeline");
    const enhanceCurrentTimeText = document.getElementById("enhance-current-time");
    const enhanceDurationText = document.getElementById("enhance-duration");
    const btnEnhanceDownload = document.getElementById("btn-enhance-download");

    let uploadedEnhanceFile = null;

    // Drag-and-Drop Handlers
    ["dragenter", "dragover"].forEach(eventName => {
        enhanceDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            enhanceDropzone.classList.add("dragover");
        }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
        enhanceDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            enhanceDropzone.classList.remove("dragover");
        }, false);
    });

    enhanceDropzone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleUploadedEnhanceFile(files[0]);
        }
    });

    enhanceFileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleUploadedEnhanceFile(e.target.files[0]);
        }
    });

    function handleUploadedEnhanceFile(file) {
        if (!file.type.startsWith("audio/")) {
            alert("Please upload a valid audio record file (WAV, MP3, etc.).");
            return;
        }
        uploadedEnhanceFile = file;
        
        // Show file loaded info panel
        loadedFilename.textContent = file.name;
        loadedFilesize.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";
        
        enhanceDropzone.style.display = "none";
        fileInfoContainer.style.display = "flex";
        btnProcessEnhance.disabled = false;

        // Load original local URL for player comparison pre-process
        if (originalBlobUrl) URL.revokeObjectURL(originalBlobUrl);
        originalBlobUrl = URL.createObjectURL(file);
        
        setupComparisonOriginalAudio();
    }

    btnRemoveFile.addEventListener("click", () => {
        uploadedEnhanceFile = null;
        enhanceDropzone.style.display = "flex";
        fileInfoContainer.style.display = "none";
        btnProcessEnhance.disabled = true;
        enhanceFileInput.value = "";
        
        stopAllAudio();
        
        // Reset player A/B completely
        btnToggleOriginal.disabled = true;
        btnToggleEnhanced.disabled = true;
        btnToggleOriginal.classList.add("active");
        btnToggleEnhanced.classList.remove("active");
        
        btnEnhancePlay.disabled = true;
        btnEnhanceStop.disabled = true;
        enhanceTimeline.disabled = true;
        btnEnhanceDownload.style.visibility = "hidden";
        enhanceWaveformPlaceholder.style.display = "flex";
    });

    function setupComparisonOriginalAudio() {
        if (enhanceAudioOriginal) {
            enhanceAudioOriginal.pause();
        }
        enhanceAudioOriginal = new Audio(originalBlobUrl);
        activeEnhanceAudio = enhanceAudioOriginal;

        enhanceWaveformPoints = generateMockWaveform(90);

        enhanceAudioOriginal.addEventListener("loadedmetadata", () => {
            enhanceDurationText.textContent = formatTime(enhanceAudioOriginal.duration);
            enhanceTimeline.max = Math.floor(enhanceAudioOriginal.duration);
            
            // Enable basic playback original
            btnEnhancePlay.disabled = false;
            btnEnhanceStop.disabled = false;
            enhanceTimeline.disabled = false;
            btnToggleOriginal.disabled = false;
            enhanceWaveformPlaceholder.style.display = "none";
            
            drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, 0, false);
        });

        enhanceAudioOriginal.addEventListener("ended", () => {
            resetPlayerUI("enhance");
            drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, 0, false);
        });
    }

    // Call API to remove noise using noisereduce
    btnProcessEnhance.addEventListener("click", async () => {
        if (!uploadedEnhanceFile) return;

        stopAllAudio();
        showLoading("Enhancing Audio Engine", "Executing Spectral Gating & Hum Removal...");
        updateLoadingProgress(15);

        const formData = new FormData();
        formData.append("file", uploadedEnhanceFile);
        formData.append("noise_reduction_strength", noiseSlider.value);

        try {
            updateLoadingProgress(45);
            const response = await fetch("/api/enhance", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Enhancement failed.");
            }

            updateLoadingProgress(80);
            const enhancedBlob = await response.blob();
            
            if (enhancedBlobUrl) URL.revokeObjectURL(enhancedBlobUrl);
            enhancedBlobUrl = URL.createObjectURL(enhancedBlob);
            
            enhanceAudioEnhanced = new Audio(enhancedBlobUrl);
            enhanceAudioEnhanced.addEventListener("loadedmetadata", () => {
                hideLoading();
                btnToggleEnhanced.disabled = false;
                
                // Show download link for clean WAV
                btnEnhanceDownload.href = enhancedBlobUrl;
                btnEnhanceDownload.download = "cleaned_" + uploadedEnhanceFile.name.replace(/\.[^/.]+$/, "") + ".wav";
                btnEnhanceDownload.style.visibility = "visible";
                
                // Pro Feature: Proactively toggle to ENHANCED to wow the user!
                triggerABToggle(true);
            });

            enhanceAudioEnhanced.addEventListener("ended", () => {
                resetPlayerUI("enhance");
                drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, 0, true);
            });

        } catch (error) {
            hideLoading();
            alert(`DSP Enhance Error: ${error.message}`);
        }
    });

    // Pro A/B Dynamic Swapper without losing playback position
    function triggerABToggle(toEnhanced) {
        if (!activeEnhanceAudio) return;
        
        const isPlaying = !activeEnhanceAudio.paused;
        const currentPlaybackTime = activeEnhanceAudio.currentTime;

        activeEnhanceAudio.pause();
        clearInterval(enhancePlayInterval);

        if (toEnhanced) {
            btnToggleOriginal.classList.remove("active");
            btnToggleEnhanced.classList.add("active");
            activeEnhanceAudio = enhanceAudioEnhanced;
        } else {
            btnToggleEnhanced.classList.remove("active");
            btnToggleOriginal.classList.add("active");
            activeEnhanceAudio = enhanceAudioOriginal;
        }

        activeEnhanceAudio.currentTime = currentPlaybackTime;
        
        if (isPlaying) {
            activeEnhanceAudio.play();
            enhancePlayInterval = setInterval(() => {
                enhanceTimeline.value = activeEnhanceAudio.currentTime;
                enhanceCurrentTimeText.textContent = formatTime(activeEnhanceAudio.currentTime);
                const progress = activeEnhanceAudio.currentTime / activeEnhanceAudio.duration;
                drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, progress, toEnhanced);
            }, 100);
        } else {
            const progress = currentPlaybackTime / activeEnhanceAudio.duration;
            drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, progress, toEnhanced);
        }
    }

    btnToggleOriginal.addEventListener("click", () => triggerABToggle(false));
    btnToggleEnhanced.addEventListener("click", () => triggerABToggle(true));

    btnEnhancePlay.addEventListener("click", () => {
        if (!activeEnhanceAudio) return;
        activeEnhanceAudio.play();
        btnEnhancePlay.style.display = "none";
        btnEnhancePause.style.display = "flex";
        
        const isCurrentlyEnhanced = (activeEnhanceAudio === enhanceAudioEnhanced);

        enhancePlayInterval = setInterval(() => {
            enhanceTimeline.value = activeEnhanceAudio.currentTime;
            enhanceCurrentTimeText.textContent = formatTime(activeEnhanceAudio.currentTime);
            const progress = activeEnhanceAudio.currentTime / activeEnhanceAudio.duration;
            drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, progress, isCurrentlyEnhanced);
        }, 100);
    });

    btnEnhancePause.addEventListener("click", () => {
        if (!activeEnhanceAudio) return;
        activeEnhanceAudio.pause();
        btnEnhancePause.style.display = "none";
        btnEnhancePlay.style.display = "flex";
        clearInterval(enhancePlayInterval);
    });

    btnEnhanceStop.addEventListener("click", () => {
        if (!activeEnhanceAudio) return;
        activeEnhanceAudio.pause();
        activeEnhanceAudio.currentTime = 0;
        resetPlayerUI("enhance");
        const isCurrentlyEnhanced = (activeEnhanceAudio === enhanceAudioEnhanced);
        drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, 0, isCurrentlyEnhanced);
    });

    enhanceTimeline.addEventListener("input", (e) => {
        if (!activeEnhanceAudio) return;
        activeEnhanceAudio.currentTime = e.target.value;
        enhanceCurrentTimeText.textContent = formatTime(activeEnhanceAudio.currentTime);
        const progress = activeEnhanceAudio.currentTime / activeEnhanceAudio.duration;
        const isCurrentlyEnhanced = (activeEnhanceAudio === enhanceAudioEnhanced);
        drawWaveform("enhance-waveform-canvas", enhanceWaveformPoints, progress, isCurrentlyEnhanced);
    });

    // ==========================================
    // 6. MODULE 3: SPEECH-TO-TEXT TRANSCRIPTION
    // ==========================================
    const transcribeDropzone = document.getElementById("transcribe-dropzone");
    const transcribeFileInput = document.getElementById("transcribe-file-input");
    const tFileInfoContainer = document.getElementById("t-file-info-container");
    const tLoadedFilename = document.getElementById("t-loaded-filename");
    const tLoadedFilesize = document.getElementById("t-loaded-filesize");
    const btnRemoveTFile = document.getElementById("btn-remove-t-file");
    const btnProcessTranscribe = document.getElementById("btn-process-transcribe");
    const transcriptEditor = document.getElementById("transcript-editor");
    const btnCopyTranscript = document.getElementById("btn-copy-transcript");

    let uploadedTranscribeFile = null;

    // Drag-and-Drop Transcription
    ["dragenter", "dragover"].forEach(eventName => {
        transcribeDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            transcribeDropzone.classList.add("dragover");
        }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
        transcribeDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            transcribeDropzone.classList.remove("dragover");
        }, false);
    });

    transcribeDropzone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleUploadedTranscribeFile(files[0]);
        }
    });

    transcribeFileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleUploadedTranscribeFile(e.target.files[0]);
        }
    });

    function handleUploadedTranscribeFile(file) {
        if (!file.type.startsWith("audio/")) {
            alert("Please upload an audio speech file.");
            return;
        }
        uploadedTranscribeFile = file;
        
        tLoadedFilename.textContent = file.name;
        tLoadedFilesize.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";
        
        transcribeDropzone.style.display = "none";
        tFileInfoContainer.style.display = "flex";
        btnProcessTranscribe.disabled = false;

        if (transcribeBlobUrl) URL.revokeObjectURL(transcribeBlobUrl);
        transcribeBlobUrl = URL.createObjectURL(file);
        
        transcribeAudio = new Audio(transcribeBlobUrl);
    }

    btnRemoveTFile.addEventListener("click", () => {
        uploadedTranscribeFile = null;
        transcribeDropzone.style.display = "flex";
        tFileInfoContainer.style.display = "none";
        btnProcessTranscribe.disabled = true;
        transcribeFileInput.value = "";
        
        stopAllAudio();
        
        transcriptEditor.innerHTML = `
            <div class="editor-empty-state">
                <i class="fa-regular fa-closed-captioning fa-2x"></i>
                <span>Click Transcribe to view full timestamped segments</span>
            </div>
        `;
        btnCopyTranscript.disabled = true;
    });

    btnProcessTranscribe.addEventListener("click", async () => {
        if (!uploadedTranscribeFile) return;

        stopAllAudio();
        showLoading("Transcribing Speech", "Booting Whisper Engine Large-V3 Dialects...");
        updateLoadingProgress(20);

        const language = document.getElementById("transcribe-lang").value;
        const formData = new FormData();
        formData.append("file", uploadedTranscribeFile);
        formData.append("language", language);

        try {
            updateLoadingProgress(60);
            const response = await fetch("/api/transcribe", {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error("Transcription server error.");

            updateLoadingProgress(90);
            const data = await response.json();
            
            hideLoading();
            renderTranscription(data);

        } catch (error) {
            hideLoading();
            alert(`Transcription Error: ${error.message}`);
        }
    });

    // Renders interactive sync segment cards
    function renderTranscription(data) {
        transcriptionSegments = data.segments;
        transcriptEditor.innerHTML = "";
        
        transcriptionSegments.forEach(seg => {
            const block = document.createElement("div");
            block.className = "segment-block";
            block.setAttribute("data-start", seg.start);
            block.setAttribute("data-end", seg.end);
            
            const isArabic = (data.language === "ar");
            block.style.direction = isArabic ? "rtl" : "ltr";

            const timeStr = formatTime(seg.start);
            
            block.innerHTML = `
                <div class="segment-header">
                    <span class="timestamp-chip">${timeStr}</span>
                    <span class="speaker-label">SPEAKER A</span>
                </div>
                <div class="segment-text" contenteditable="true">${seg.text}</div>
            `;
            
            // Clicking segment seeks the player instantly!
            block.addEventListener("click", (e) => {
                // If user is editing text inside contenteditable, don't hijack focus
                if (e.target.classList.contains("segment-text")) return;
                
                if (transcribeAudio) {
                    transcribeAudio.currentTime = seg.start;
                    transcribeAudio.play();
                    startTranscriptionPlayheadTracker();
                }
            });

            transcriptEditor.appendChild(block);
        });

        btnCopyTranscript.disabled = false;
    }

    function startTranscriptionPlayheadTracker() {
        clearInterval(transcribePlayInterval);
        transcribePlayInterval = setInterval(() => {
            if (!transcribeAudio) return;
            const currentTime = transcribeAudio.currentTime;
            
            // Highlight current talking segment block
            const blocks = document.querySelectorAll(".segment-block");
            blocks.forEach(block => {
                const start = parseFloat(block.getAttribute("data-start"));
                const end = parseFloat(block.getAttribute("data-end"));
                
                if (currentTime >= start && currentTime <= end) {
                    block.classList.add("active");
                } else {
                    block.classList.remove("active");
                }
            });
        }, 150);
    }

    // Copy full transcript text button logic
    btnCopyTranscript.addEventListener("click", () => {
        const textElements = document.querySelectorAll(".segment-text");
        let fullText = "";
        textElements.forEach(el => {
            fullText += el.textContent.trim() + "\n";
        });
        
        navigator.clipboard.writeText(fullText).then(() => {
            const originalText = btnCopyTranscript.innerHTML;
            btnCopyTranscript.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
            setTimeout(() => {
                btnCopyTranscript.innerHTML = originalText;
            }, 2000);
        });
    });

});
