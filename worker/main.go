package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gocv.io/x/gocv"
)

type StartRequest struct {
	CameraID string `json:"cameraId"`
	RtspURL  string `json:"rtspUrl"`
	FPS      int    `json:"fps"`
}

type StopRequest struct {
	CameraID string `json:"cameraId"`
}

type streamState struct {
	cancel chan struct{}
}

var (
	streams   = make(map[string]*streamState)
	streamsMu sync.Mutex
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.POST("/start", startStream)
	r.POST("/stop", stopStream)
	addr := ":8081"
	log.Printf("Worker listening on %s", addr)
	r.Run(addr)
}

func startStream(c *gin.Context) {
	var req StartRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad payload"})
		return
	}
	streamsMu.Lock()
	defer streamsMu.Unlock()
	if _, ok := streams[req.CameraID]; ok {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	st := &streamState{cancel: make(chan struct{})}
	streams[req.CameraID] = st
	go runPipeline(req, st)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func stopStream(c *gin.Context) {
	var req StopRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad payload"})
		return
	}
	streamsMu.Lock()
	defer streamsMu.Unlock()
	if st, ok := streams[req.CameraID]; ok {
		close(st.cancel)
		delete(streams, req.CameraID)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func runPipeline(req StartRequest, st *streamState) {
	backend := getenv("BACKEND_URL", "http://backend:8080")
	mediaPrefix := getenv("MEDIA_PREFIX", "rtsp://mediamtx:8554")
	outPath := fmt.Sprintf("%s/camera-%s", mediaPrefix, req.CameraID)

	// Start ffmpeg to publish to MediaMTX
	ff := exec.Command("ffmpeg",
		"-y",
		"-f", "rawvideo",
		"-pix_fmt", "bgr24",
		"-s", "640x480",
		"-r", fmt.Sprintf("%d", max(1, req.FPS)),
		"-i", "-",
		"-an",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-tune", "zerolatency",
		"-f", "rtsp",
		"-rtsp_transport", "tcp",
		outPath,
	)
	stdin, err := ff.StdinPipe()
	if err != nil {
		log.Printf("ffmpeg stdin: %v", err)
		return
	}
	if err := ff.Start(); err != nil {
		log.Printf("ffmpeg start: %v", err)
		return
	}

	retryDelay := time.Second
	for {
		select {
		case <-st.cancel:
			stdin.Close()
			ff.Process.Kill()
			return
		default:
		}

		cap, err := gocv.OpenVideoCapture(req.RtspURL)
		if err != nil {
			log.Printf("open rtsp: %v", err)
			time.Sleep(retryDelay)
			retryDelay = minDuration(retryDelay*2, 30*time.Second)
			continue
		}
		cap.Set(gocv.VideoCaptureFPS, float64(max(1, req.FPS)))
		img := gocv.NewMat()
		defer img.Close()

		classifier := gocv.NewCascadeClassifier()
		if !classifier.Load("/app/haarcascade_frontalface_default.xml") {
			log.Printf("failed to load cascade")
		}
		defer classifier.Close()

		lastAlert := time.Now().Add(-10 * time.Second)

		for {
			select {
			case <-st.cancel:
				cap.Close()
				stdin.Close()
				ff.Process.Kill()
				return
			default:
			}
			ok := cap.Read(&img)
			if !ok || img.Empty() {
				continue
			}

			// Resize to 640x480 for ffmpeg input
			gocv.Resize(img, &img, image.Pt(640, 480), 0, 0, gocv.InterpolationLinear)

			rects := classifier.DetectMultiScale(img)
			for _, r := range rects {
				gocv.Rectangle(&img, r, colorRGB(0, 255, 0), 2)
				gocv.PutText(&img, fmt.Sprintf("ID:%s FPS:%d", req.CameraID, req.FPS), image.Pt(r.Min.X, max(0, r.Min.Y-5)), gocv.FontHersheyPlain, 1.2, colorRGB(255, 255, 255), 1)
			}

			// Alerts throttled to 1/sec
			if len(rects) > 0 && time.Since(lastAlert) > time.Second {
				lastAlert = time.Now()
				go postAlert(backend, req.CameraID, rects)
			}

			// Write raw frame to ffmpeg stdin
			if _, err := stdin.Write(img.ToBytes()); err != nil {
				log.Printf("write ffmpeg: %v", err)
				break
			}
		}
		cap.Close()
	}
}

func postAlert(backend, cameraID string, rects []image.Rectangle) {
	payload := map[string]any{ "rects": rects }
	body := map[string]any{
		"cameraId": cameraID,
		"label": "face",
		"score": 0.9,
		"payload": payload,
	}
	b, _ := json.Marshal(body)
	resp, err := http.Post(backend+"/api/alerts", "application/json", bytes.NewReader(b))
	if err != nil {
		log.Printf("post alert: %v", err)
		return
	}
	resp.Body.Close()
}

func getenv(k, d string) string { if v := os.Getenv(k); v != "" { return v }; return d }
func max(a, b int) int { if a > b { return a }; return b }
func minDuration(a, b time.Duration) time.Duration { if a < b { return a }; return b }

func colorRGB(r, g, b uint8) gocv.Scalar { return gocv.NewScalar(float64(b), float64(g), float64(r), 0) } 