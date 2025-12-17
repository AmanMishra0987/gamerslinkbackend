const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');

class ServerMonitor {
  constructor() {
    this.serverProcess = null;
    this.frontendProcess = null;
    this.restartCount = 0;
    this.frontendRestartCount = 0;
    this.maxRestarts = 10;
    this.maxFrontendRestarts = 5;
    this.restartDelay = 5000; // 5 seconds
    this.frontendRestartDelay = 3000; // 3 seconds
    this.logFile = path.join(__dirname, 'server-crashes.log');
    this.backendPort = 5000;
    this.frontendPort = 3000;
    this.healthCheckInterval = null;
    this.frontendHealthCheckInterval = null;
    this.isShuttingDown = false;
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage.trim());
    
    // Also write to log file
    fs.appendFileSync(this.logFile, logMessage);
  }

  async findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        await new Promise((resolve, reject) => {
          const server = net.createServer();
          server.listen(port, () => {
            server.close();
            resolve(port);
          });
          server.on('error', () => {
            reject();
          });
        });
        return port;
      } catch (error) {
        continue;
      }
    }
    throw new Error(`No available ports found starting from ${startPort}`);
  }

  async killProcessOnPort(port) {
    try {
      const { exec } = require('child_process');
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // Windows: Find and kill process using the port
        const command = `netstat -ano | findstr :${port}`;
        exec(command, (error, stdout) => {
          if (stdout) {
            const lines = stdout.split('\n');
            lines.forEach(line => {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 5) {
                const pid = parts[4];
                if (pid && pid !== '0') {
                  try {
                    // Force kill the process
                    exec(`taskkill /F /PID ${pid}`, (killError) => {
                      if (killError) {
                        this.log(`❌ Failed to kill process ${pid}: ${killError.message}`);
                      } else {
                        this.log(`🔫 Killed process ${pid} using port ${port}`);
                      }
                    });
                  } catch (e) {
                    this.log(`❌ Error killing process ${pid}: ${e.message}`);
                  }
                }
              }
            });
          }
        });
      } else {
        // Linux/Mac: Find and kill process using the port
        const command = `lsof -ti:${port}`;
        exec(command, (error, stdout) => {
          if (stdout) {
            const pids = stdout.trim().split('\n');
            pids.forEach(pid => {
              if (pid) {
                try {
                  process.kill(parseInt(pid), 'SIGKILL');
                  this.log(`🔫 Killed process ${pid} using port ${port}`);
                } catch (e) {
                  this.log(`❌ Error killing process ${pid}: ${e.message}`);
                }
              }
            });
          }
        });
      }
      
      // Wait a bit for the process to be killed
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      this.log(`⚠️ Error killing process on port ${port}: ${error.message}`);
    }
  }

  async ensurePortAvailable(port) {
    try {
      const testServer = net.createServer();
      await new Promise((resolve, reject) => {
        testServer.listen(port, () => {
          testServer.close();
          resolve();
        });
        testServer.on('error', reject);
      });
      return true;
    } catch (error) {
      this.log(`⚠️ Port ${port} is in use, attempting to free it...`);
      await this.killProcessOnPort(port);
      
      // Test again after killing
      try {
        const testServer2 = net.createServer();
        await new Promise((resolve, reject) => {
          testServer2.listen(port, () => {
            testServer2.close();
            resolve();
          });
          testServer2.on('error', reject);
        });
        this.log(`✅ Port ${port} is now available`);
        return true;
      } catch (error2) {
        this.log(`❌ Port ${port} still not available after cleanup`);
        return false;
      }
    }
  }

  async startServer() {
    this.log(`🚀 Starting backend server (attempt ${this.restartCount + 1}/${this.maxRestarts})`);
    
    // Always try to kill any existing process on the port first
    await this.killProcessOnPort(this.backendPort);
    
    // Ensure backend port is available
    const backendAvailable = await this.ensurePortAvailable(this.backendPort);
    if (!backendAvailable) {
      this.log(`❌ Backend port ${this.backendPort} not available, trying alternative port...`);
      try {
        this.backendPort = await this.findAvailablePort(this.backendPort + 1);
        this.log(`🔄 Using alternative backend port: ${this.backendPort}`);
      } catch (error) {
        this.log(`❌ No alternative backend ports available`);
        this.handleServerExit();
        return;
      }
    }
    
    this.serverProcess = spawn('node', ['server.js'], {
      stdio: 'inherit',
      shell: true,
      cwd: __dirname,
      env: { ...process.env, PORT: this.backendPort.toString() }
    });

    this.serverProcess.on('error', (error) => {
      this.log(`❌ Backend server process error: ${error.message}`);
      this.handleServerExit();
    });

    this.serverProcess.on('close', (code) => {
      if (!this.isShuttingDown) {
        this.log(`⚠️ Backend server process exited with code ${code}`);
        this.handleServerExit();
      }
    });

    this.serverProcess.on('exit', (code) => {
      if (!this.isShuttingDown) {
        this.log(`⚠️ Backend server process exited with code ${code}`);
        this.handleServerExit();
      }
    });

    // Start health check after a delay to allow server to start
    setTimeout(() => {
      this.startHealthCheck();
    }, 10000);
  }

  async startFrontend() {
    this.log(`🎨 Starting frontend (attempt ${this.frontendRestartCount + 1}/${this.maxFrontendRestarts})`);
    
    // Ensure frontend port is available
    const frontendAvailable = await this.ensurePortAvailable(this.frontendPort);
    if (!frontendAvailable) {
      this.log(`❌ Frontend port ${this.frontendPort} not available, trying alternative port...`);
      try {
        this.frontendPort = await this.findAvailablePort(this.frontendPort + 1);
        this.log(`🔄 Using alternative frontend port: ${this.frontendPort}`);
      } catch (error) {
        this.log(`❌ No alternative frontend ports available`);
        this.handleFrontendExit();
        return;
      }
    }
    
    const frontendPath = path.join(__dirname, '..', 'frontend');
    
    this.frontendProcess = spawn('npm', ['start'], {
      stdio: 'inherit',
      shell: true,
      cwd: frontendPath,
      env: { 
        ...process.env, 
        BROWSER: 'none',
        PORT: this.frontendPort.toString()
      }
    });

    this.frontendProcess.on('error', (error) => {
      this.log(`❌ Frontend process error: ${error.message}`);
      this.handleFrontendExit();
    });

    this.frontendProcess.on('close', (code) => {
      if (!this.isShuttingDown) {
        this.log(`⚠️ Frontend process exited with code ${code}`);
        this.handleFrontendExit();
      }
    });

    this.frontendProcess.on('exit', (code) => {
      if (!this.isShuttingDown) {
        this.log(`⚠️ Frontend process exited with code ${code}`);
        this.handleFrontendExit();
      }
    });

    // Start frontend health check after a delay
    setTimeout(() => {
      this.startFrontendHealthCheck();
    }, 15000);
  }

  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkBackendHealth();
    }, 30000); // Check every 30 seconds
  }

  startFrontendHealthCheck() {
    if (this.frontendHealthCheckInterval) {
      clearInterval(this.frontendHealthCheckInterval);
    }

    this.frontendHealthCheckInterval = setInterval(() => {
      this.checkFrontendHealth();
    }, 30000); // Check every 30 seconds
  }

  checkBackendHealth() {
    const options = {
      hostname: 'localhost',
      port: this.backendPort,
      path: '/api/health',
      method: 'GET',
      timeout: 10000 // Increased timeout to 10 seconds
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        this.log('✅ Backend health check passed');
      } else {
        this.log(`⚠️ Backend health check failed with status: ${res.statusCode}`);
        this.handleServerExit();
      }
    });

    req.on('error', (error) => {
      this.log(`❌ Backend health check error: ${error.message}`);
      this.handleServerExit();
    });

    req.on('timeout', () => {
      this.log('⏰ Backend health check timeout');
      req.destroy();
      this.handleServerExit();
    });

    req.end();
  }

  checkFrontendHealth() {
    const options = {
      hostname: 'localhost',
      port: this.frontendPort,
      path: '/',
      method: 'GET',
      timeout: 10000 // Increased timeout to 10 seconds
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        this.log('✅ Frontend health check passed');
      } else {
        this.log(`⚠️ Frontend health check failed with status: ${res.statusCode}`);
        this.handleFrontendExit();
      }
    });

    req.on('error', (error) => {
      this.log(`❌ Frontend health check error: ${error.message}`);
      this.handleFrontendExit();
    });

    req.on('timeout', () => {
      this.log('⏰ Frontend health check timeout');
      req.destroy();
      this.handleFrontendExit();
    });

    req.end();
  }

  handleServerExit() {
    if (this.isShuttingDown) return;
    
    this.restartCount++;
    
    if (this.restartCount >= this.maxRestarts) {
      this.log(`❌ Maximum backend restart attempts (${this.maxRestarts}) reached. Stopping monitor.`);
      this.stop();
      process.exit(1);
    }

    this.log(`🔄 Restarting backend server in ${this.restartDelay / 1000} seconds...`);
    
    // Stop frontend if backend is down
    if (this.frontendProcess) {
      this.log('🛑 Stopping frontend due to backend failure...');
      this.stopFrontend();
    }
    
    setTimeout(() => {
      this.startServer();
    }, this.restartDelay);
  }

  handleFrontendExit() {
    if (this.isShuttingDown) return;
    
    this.frontendRestartCount++;
    
    if (this.frontendRestartCount >= this.maxFrontendRestarts) {
      this.log(`❌ Maximum frontend restart attempts (${this.maxFrontendRestarts}) reached.`);
      // Don't exit the monitor, just stop trying to restart frontend
      return;
    }

    this.log(`🔄 Restarting frontend in ${this.frontendRestartDelay / 1000} seconds...`);
    
    setTimeout(() => {
      this.startFrontend();
    }, this.frontendRestartDelay);
  }

  stop() {
    this.isShuttingDown = true;
    this.log('🛑 Stopping server monitor...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.frontendHealthCheckInterval) {
      clearInterval(this.frontendHealthCheckInterval);
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill('SIGINT');
    }
    
    if (this.frontendProcess) {
      this.stopFrontend();
    }
  }

  stopFrontend() {
    if (this.frontendProcess) {
      this.frontendProcess.kill('SIGINT');
      this.frontendProcess = null;
    }
  }
}

// Create monitor instance
const monitor = new ServerMonitor();

// Handle process termination
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  monitor.stop();
  process.exit(0);
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  monitor.log(`💥 Uncaught Exception: ${error.message}`);
  monitor.log(`Stack: ${error.stack}`);
  // Don't exit, let the monitor handle it
});

process.on('unhandledRejection', (reason, promise) => {
  monitor.log(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Don't exit, let the monitor handle it
});

// Start monitoring
monitor.log('📊 Enhanced server monitor started with port conflict resolution');
monitor.startServer();

// Start frontend after a delay to ensure backend is running
setTimeout(() => {
  monitor.startFrontend();
}, 5000);
