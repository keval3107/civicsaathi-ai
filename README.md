# CivicSaathi AI (civicsaathi-ai)

> **Important Disclaimer**: CivicSaathi AI is an independent civic-technology prototype built for demonstration and hackathon purposes. It uses an internal **mock AMC dataset** for Ahmedabad localities, wards, and municipal departments. It is **NOT** an official government portal, does **NOT** represent the Ahmedabad Municipal Corporation (AMC), and does **NOT** file official government complaints.

---

CivicSaathi AI is an agentic civic complaint assistant designed for Ahmedabad, Gujarat. Citizens report issues like potholes, garbage accumulation, broken streetlights, or waterlogging simply by providing a photo and locality.

The system uses Google Gemini multimodal vision to classify the issue and evaluate visual evidence, resolves the municipal ward and responsible department using structured database rules, checks for open duplicate tickets in the area, and creates a traceable complaint record upon explicit citizen confirmation.

---

## Key Features

- **Multimodal Civic Image Analysis**: Analyzes street photos with Google Gemini (`@google/genai`), extracting structured `issue_type`, visual `description`, `severity` (low, medium, high, critical, unknown), and `confidence` score.
- **Resilient AI Fallback & Transparency**: Employs automatic model fallback across `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, and `gemini-3.5-flash`. When no API key is provided or the network is unavailable, it falls back to a transparent simulated mode without fabricating results.
- **Deterministic Ward & Department Resolution**: Uses parameterised SQLite queries to resolve informal Ahmedabad localities (e.g., Navrangpura, Satellite, Vastrapur) into administrative wards and responsible municipal departments (Road Project, Solid Waste, Light Dept, etc.).
- **Proactive Duplicate Detection**: Checks for existing open complaints in the same ward and category before filing to prevent duplicate backlogs.
- **Citizen Confirmation Safeguard**: Never automatically files a complaint without explicit user review and confirmation.
- **Complaint Tracking & Natural Language Chat**: Generates unique tracking IDs (`CSA-XXXXXXXX`) and allows citizens to query status either via tracking page or natural language assistant using Gemini function calling (`get_complaint_status`).
- **Real-Time Agent Activity Trail**: Inspectable audit log of every backend tool execution (parameters, execution time, and outcome).
- **Persistent SQLite Storage**: Built on Node's native `node:sqlite` with WAL mode, transactions, status history tracking, and idempotency protection.

---

## Tech Stack

| Layer | Technology | Rationale |
| --- | --- | --- |
| **Frontend** | React 19, TypeScript, Vite | Fast, responsive UI with strict typing |
| **Styling** | Vanilla CSS Design System | Zero heavy framework dependencies, fast load times, accessible design tokens |
| **Icons** | Lucide React | Consistent, accessible iconography |
| **Backend** | Node.js (22.13+ / 24+), Express 5 | High-performance asynchronous runtime |
| **Database** | SQLite (`node:sqlite`) | Zero native compilation build step, transactional, file-based persistence |
| **AI / Vision** | Google Gemini (`@google/genai`) | Structured JSON schema outputs and native function calling |
| **Security** | Helmet, Multer, Express Rate Limit | Restrictive CSP, magic-byte image sniffing, rate limiting, parameterised SQL |

---

## Architecture & Workflow

```text
Citizen (Browser / Mobile)
   │
   ├── [POST /api/analyze] ───────► Express 5 Upload Handler
   │                                  ├── Magic-byte verification (JPEG/PNG/WEBP, 5 MB limit)
   │                                  └── server/gemini.js: analyze_civic_image (Gemini Vision)
   │
   ├── [POST /api/route] ─────────► server/tools.js
   │                                  ├── lookup_ward (locality normalization)
   │                                  ├── lookup_department (ward + category mapping)
   │                                  └── check_duplicate_complaint (existing open tickets)
   │
   ├── [POST /api/complaints] ────► Transactional SQLite Persistence
   │                                  ├── Idempotency key verification
   │                                  ├── Complaint record insert (tracking ID: CSA-XXXXXXXX)
   │                                  └── complaint_status_history initial record
   │
   └── [POST /api/chat] ──────────► Gemini Function Calling
                                      └── get_complaint_status -> Reads real database record
```

---

## Local Setup

### Prerequisites

- **Node.js**: `v22.13.0` or newer (Tested on Node.js `v24.11.0`)
- **npm**: `v10.0.0` or newer
- **Gemini API Key** (Optional): Obtain a free key from [Google AI Studio](https://aistudio.google.com/). The app will run in simulated demo mode if no key is configured.

### Step-by-Step Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/civicsaathi-ai.git
   cd civicsaathi-ai
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   GEMINI_MODEL=gemini-3.1-flash-lite
   PORT=8080
   DB_PATH=./data/civicsaathi.db
   UPLOAD_DIR=./data/uploads
   ```

4. **Run development server** (starts backend on `http://localhost:8080` and Vite dev server):
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:8080`.

5. **Production Build & Execution**:
   ```bash
   npm run build
   npm start
   ```

---

## Environment Variables

| Variable | Default | Required | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | *(empty)* | Optional | Google Gemini API key. If absent, runs in simulated demo mode. Server-side only. |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Optional | Primary Gemini model. Auto-falls back to `gemini-3.5-flash-lite` or `gemini-3.5-flash` if unavailable. |
| `PORT` | `8080` | Optional | HTTP server listening port. |
| `DB_PATH` | `./data/civicsaathi.db` | Optional | Filepath for local SQLite database. |
| `UPLOAD_DIR` | `./data/uploads` | Optional | Directory for storing uploaded complaint photos. |
| `CORS_ORIGIN` | *(empty)* | Optional | Comma-separated allowed origins for cross-origin requests. Empty allows same-origin. |

---

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check reporting service status, SQLite connectivity, and AI mode. |
| `GET` | `/api/meta` | System metadata: supported categories, statuses, localities, and upload limits. |
| `GET` | `/api/wards/lookup` | Query ward by locality name (`?locality=Navrangpura`). |
| `POST` | `/api/analyze` | Multipart photo upload. Validates magic bytes and returns AI analysis. |
| `POST` | `/api/route` | Resolves locality to ward, department, and checks for open duplicates. |
| `POST` | `/api/complaints` | Creates a complaint record. Requires `confirmed: true` and `idempotencyKey`. |
| `GET` | `/api/complaints` | Lists complaints with optional filters (`q`, `category`, `status`). |
| `GET` | `/api/complaints/:id` | Retrieves complaint details and status timeline by tracking ID. |
| `PATCH` | `/api/complaints/:id/status`| Updates complaint status and appends a status history note. |
| `POST` | `/api/chat` | Natural language status assistant powered by Gemini tool calling. |
| `GET` | `/api/activity` | Returns audit events for the active session (`x-session-id`). |
| `GET` | `/api/uploads/:id` | Serves uploaded image by secure randomized identifier. |

---

## Testing

The project includes automated integration tests using Node's native test runner (`node:test`):

```bash
# Run automated test suite
npm test
```

### Test Coverage
The 12 test suites validate:
1. Database initialization and table creation.
2. Seed data initialization without overwriting user data.
3. Ward lookup via SQLite names and aliases.
4. Ambiguous and unknown locality detection.
5. Deterministic department routing rules.
6. Proactive duplicate detection within the same ward.
7. Complaint persistence, idempotency verification, and history tracking.
8. Rejection of invalid inputs and malicious paths.
9. Transaction rollback on partial write failures.
10. Status retrieval and status updates with history log.
11. End-to-end HTTP workflow (analyze -> route -> lookup -> confirm -> status -> chat).
12. API error handling (404, 413 file size limits, 415 invalid formats, 422 unresolved wards).

To run live end-to-end verification against a running instance:
```bash
node scripts/smoke.mjs
```

---

## Security Practices

- **Zero Client-Side Secrets**: `GEMINI_API_KEY` is loaded and executed strictly on the Node.js backend. It is never sent to the client, logged in output streams, or checked into version control.
- **Strict File Upload Validation**: Files are checked via magic bytes (`sniffImage`), size-limited to 5 MB, stored with random hex names outside the public web root, and served only by identifier.
- **SQL Injection Prevention**: Parameterised prepared statements used exclusively across all database queries.
- **Idempotency Protection**: Client-generated idempotency keys ensure network retries do not create duplicate complaint records.
- **Hardened HTTP Headers**: Helmet enabled with custom Content Security Policy (CSP), disabled `X-Powered-By`, and in-memory rate limiting.

---

## Deployment (Docker & Cloud Run)

### Docker

A production `Dockerfile` is provided:

```bash
# Build the Docker image
docker build -t civicsaathi-ai .

# Run container locally
docker run -p 8080:8080 -e GEMINI_API_KEY="your_api_key" civicsaathi-ai
```

### Google Cloud Run

```bash
gcloud run deploy civicsaathi-ai \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --add-volume name=data,type=cloud-storage,bucket=YOUR_STORAGE_BUCKET \
  --add-volume-mount volume=data,mount-path=/data \
  --set-env-vars DB_JOURNAL_MODE=DELETE
```

---

## License

ISC License. Built for civic innovation and educational demonstrations.
