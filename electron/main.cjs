const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const { app, BrowserWindow, shell } = require("electron");

const isPackaged = app.isPackaged;
const appRoot = isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");

process.env.NODE_ENV = "production";
process.env.MOTIONXAMON_APP_ROOT = appRoot;

let mainWindow;
let logFile;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function log(message) {
  try {
    if (!logFile) return;
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    // Ignore logging failures.
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 4117;
      server.close(() => resolve(port));
    });
  });
}

function startServer() {
  log(`starting server on port ${process.env.PORT}`);
  require(path.join(appRoot, "dist", "server.cjs"));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: "#0A0B0E",
    title: "motionxamon",
    icon: path.join(appRoot, "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://127.0.0.1:${process.env.PORT}`);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

process.on("uncaughtException", (error) => {
  log(`uncaughtException: ${error.stack || error.message || error}`);
});

process.on("unhandledRejection", (error) => {
  log(`unhandledRejection: ${error && error.stack ? error.stack : error}`);
});

app.whenReady().then(async () => {
  app.setName("motionxamon");
  logFile = path.join(app.getPath("userData"), "motionxamon.log");
  process.env.MOTIONXAMON_DEFAULT_DOWNLOADS_DIR = path.join(app.getPath("downloads"), "motionxamon");
  process.env.MOTIONXAMON_TOOLS_DIR = path.join(app.getPath("userData"), "tools");
  process.env.PORT = String(await findFreePort());
  startServer();
  setTimeout(createWindow, 700);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
