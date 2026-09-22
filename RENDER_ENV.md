# Render Cloud Deployment Guide & Environment Variables

This document provides step-by-step instructions and all environment variables required to deploy the **NeuralMail AI Backend** to [Render](https://render.com).

---

## 📋 Render Web Service Settings

- **Service Type**: Web Service
- **Environment**: Docker
- **Repository**: `https://github.com/Omkar-patil-270/neuralmail-ai.git`
- **Branch**: `main`
- **Root Directory**: Leave blank (uses root `Dockerfile`)
- **Instance Type**: Free or Starter
- **Health Check Path**: `/api/email/health`

---

## 🔑 Environment Variables for Render Dashboard

Go to your Render Web Service dashboard -> **Environment** tab, and add the following keys:

| Environment Variable Name | Example / Value Format | Description |
| :--- | :--- | :--- |
| `PORT` | `8082` | Server port (Render sets dynamically if omitted) |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<neon-host>.aws.neon.tech/neondb?sslmode=require` | Neon Serverless PostgreSQL URL |
| `SPRING_DATASOURCE_USERNAME` | `<neon-db-username>` | Database User |
| `SPRING_DATASOURCE_PASSWORD` | `<neon-db-password>` | Database Password |
| `GROQ_API_KEY` | `<your_groq_api_key>` | Groq Cloud LLM & Whisper API Key |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | High-accuracy fast model |
| `GEMINI_API_KEY` | `AIza...` / `AQ...` | Google Gemini Vision API Key |

*(Note: Your actual secret credentials are saved locally in your private `.env` and `application-local.properties` file which are git-ignored).*

---

## 🚀 Step-by-Step Deployment on Render

1. Log in to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** -> **Web Service**.
3. Select **Build and deploy from a Git repository**.
4. Connect your GitHub account and select:
   `https://github.com/Omkar-patil-270/neuralmail-ai`
5. Configure:
   - **Name**: `neuralmail-ai-backend`
   - **Region**: Oregon (US West) or Ohio (US East)
   - **Branch**: `main`
   - **Runtime**: `Docker`
6. Add the environment variables from the table above in the **Environment Variables** section.
7. Click **Create Web Service**.
8. Render will pull the repository, build the Docker container using Maven + OpenJDK 21, and deploy your live URL (e.g. `https://neuralmail-ai-backend.onrender.com`).

---

## 🌐 Connecting Chrome Extension to Render

Once Render finishes deploying:
1. Copy your live Render URL (e.g. `https://neuralmail-ai-backend.onrender.com`).
2. In the Chrome extension popup (or `chrome://extensions`), set your Backend URL to your live Render URL.
3. Your extension is now 100% cloud-hosted and can be used on any computer worldwide!
