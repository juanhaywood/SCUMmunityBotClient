var robot = require("robotjs");
var net = require('net');
var fs = require('fs');
Tail = require('tail').Tail;
var ini = require('ini');
var opn = require('opn');
var exec = require('child_process').exec;
const ffi = require('ffi-napi');
const clipboardy = require('clipboardy');
const { Console } = require("console");
var fsR = require('fs-reverse'), filePath = process.env.LOCALAPPDATA + '\\SCUM\\Saved\\Logs\\SCUM.log';

const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

// create the server
let server = net.createServer(connection => {
    // run all of this when a client connects
    console.log("new connection");

    connection.on("data", data => {
        // run this when data is received
        if (data == undefined || data == null) {
            return;
        }
        const d = JSON.parse(data);

        if (d.length === 0) { // in case there is no command
            connection.write("ERROR no data");
            return; // prevents other code from running
        }
        const type = d.type; // gets the command

        switch (d.type) {
            case "moveMouse":
                robot.moveMouse(d.args.x, d.args.y);
                return;
            case "getMousePos":
                var mouse = robot.getMousePos();
                console.log("Mouse is at x:" + mouse.x + " y:" + mouse.y);
                return;
            case "typeString":
                robot.moveMouse(60, 240);
                robot.mouseClick();
                robot.mouseClick();
                robot.typeString(d.args);
                robot.keyTap("enter");
                return;
            case "keyTap":
                robot.keyTap(d.args);
                return;
            case "fetchReturn":
                //fetchReturn(d.args[0].command);

                const myPromise = new Promise((resolve, reject) => {
                    prepareWindow();
                    resolve();
                });

                myPromise.then(function () {
                    clipboardy.writeSync("Not copied yet");
                    var output = clipboardy.readSync();
                    console.log("Clipboard set to " + output);
                    var results = "";
                    var test = 0;
                    setTimeout(() => {
                        robot.moveMouse(60, 240);
                        robot.mouseClick();
                        robot.mouseClick();
                        robot.typeString(d.args[0].command);
                        robot.keyTap("enter");
                        console.log("Sent command to game: " + d.args[0].command);
                        if (output == "Not copied yet") {
                            console.log("Results not ready. Waiting to receive results");
                            while (output == "Not copied yet") {
                                test++;
                                output = clipboardy.readSync();
                                if (output != "Not copied yet") {
                                    console.log("Copied command results to clipboard. While loop = " + test);
                                    results = output.replace(/(?:\r\n|\r|\n)/g, '\\n');
                                    var payload = '{ "command":"' + d.args[0].command + '", "steamID":"' + d.args[0].steamID + '", "results":"' + results + '" }';
                                    tcpClient(payload);
                                }
                            }
                        } else {
                            console.log("Immediately had results");
                            results = output.replace(/(?:\r\n|\r|\n)/g, '\\n');
                            var payload = '{ "command":"' + d.args[0].command + '", "steamID":"' + d.args[0].steamID + '", "results":"' + results + '" }';
                            tcpClient(payload);
                        }
                    }, 1000);
                }, function () {
                    console.log("Promise Failed");
                });
                return;
            default:
                connection.write("ERROR invalid command");
                return;
        }
    });
});

// look for a connection on config.ini:TCPServerPort
server.listen(config.TCPServerPort, () => {
    console.log("waiting for a connection"); // prints on start
    isSCUMRunning();
});

function isSCUMRunning() {
    const isRunning = (query, cb) => {
        let platform = process.platform;
        let cmd = '';
        switch (platform) {
            case 'win32': cmd = `tasklist`; break;
            case 'darwin': cmd = `ps -ax | grep ${query}`; break;
            case 'linux': cmd = `ps -A`; break;
            default: break;
        }
        exec(cmd, (err, stdout, stderr) => {
            cb(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
        });
    }
    isRunning('scum.exe', (status) => {
        console.log("Game Running?: " + status); // true|false
        if (status != true) {
            gameStateInit = "Closed";
            initialTasks();
        } else {
            tailInit();//Initial tail to get latest gameState
        }
    })
}

function tailInit() {
    var logs = fsR(filePath, {});

    logs.on('data', function listener(line) {
        if (line.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'")) {
            gameStateInit = "In Main Menu";
            logs.removeListener('data', listener);
            initialTasks();
        } else if (line.includes("' logged in") && !line.includes("LogSCUM: User '")) {
            gameStateInit = "In Game";
            logs.removeListener('data', listener);
            initialTasks();
        }
        // else {
        //     console.log("Unable to find game initial state in logs.")
        // }
    });
}

function initialTasks() {
    gameState = gameStateInit;

    console.log("Game Init State: " + gameState);

    //Now run initial tasks //Look into using "switch" instead //Need to handle undefined state
    if (gameState == "In Main Menu") {
        console.log("-> Running Initial 'Start' Tasks");
        prepareWindow();
        continueGameInit();
        tailMain();
    } else if (gameState == "Closed") {
        console.log("-> Running Initial 'Closed' Tasks");
        tailMain();
        opn('steam://rungameid/513710');
    } else if (gameState == "In Game") {
        console.log("-> Running Initial 'In Game' Tasks");
        prepareWindow();
        setTimeout(() => {
            robot.moveMouse(60, 240);
            robot.mouseClick();
            robot.mouseClick();
            robot.keyTap("t");
            robot.keyTap("backspace");
            robot.typeString("SCUMmunity Bot Initializing...");
            robot.keyTap("enter");
        }, 5000);
        tailMain();
    }
}

function tailMain() {//review to improve code
    console.log("Tailing SCUM.log file and updating game states.");
    const filePath = process.env.LOCALAPPDATA + '\\SCUM\\Saved\\Logs\\SCUM.log';
    var options = { fromBeginning: false };
    tail = new Tail(filePath, options);
    //Begin Tail
    tail.on("line", function (data) {

        //If at main menu, and previous location was NOT in-game, prepare window, enter bot mode, and continue game.
        if (data.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'") && gameState == "In Main Menu") {
            console.log("Still In Main Menu. Retrying connection...");
            gameState = "In Main Menu";
            tcpClient(gameState);
            console.log("-> Running 'Resume' Tasks");
            continueGame();
            //need to do check to see if succesfully change, i.e. when server is down. If not, wait 10 secs then retry.
        } else if (data.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'") && gameState != "In Game") {
            console.log("State Change: " + gameState + " -> " + "In Main Menu");
            gameState = "In Main Menu";
            tcpClient(gameState);
            console.log("-> Running 'Start' Tasks");
            continueGameInit();
        }
        //If at main menu, and previous location WAS in-game, prepare window, and continue game.
        else if (data.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'") && gameState == "In Game") {
            console.log("State Change: " + gameState + " -> " + "In Main Menu");
            gameState = "In Main Menu";
            tcpClient(gameState);
            console.log("-> Running 'Resume' Tasks");
            continueGame();
            //need to do check to see if succesfully change, i.e. when server is down. If not, wait 10 secs then retry.
        } else if (data.includes("LogExit: Exiting") || data.includes("LogExit: Executing StaticShutdownAfterError")) {
            console.log("State Change: " + gameState + " -> " + "Closed");
            gameState = "Closed";
            tcpClient(gameState);
            console.log("-> Running 'Closed' Tasks");
            setTimeout(() => {
                opn('steam://rungameid/513710');
            }, 30000);
        } else if (data.includes("' logged in") && !data.includes("LogSCUM: User '")) {
            console.log("State Change: " + gameState + " -> " + "In Game");
            gameState = "In Game";
            tcpClient(gameState);
            console.log("Should be In Game: " + gameState);
            console.log("-> Running 'In Game' Tasks");
            prepareWindow();
            //Wait 30 seconds, then send "T" to open chat window.
            setTimeout(() => {
                robot.keyTap("t");
                robot.keyTap("backspace");
                robot.typeString("SCUMmunity Bot Initializing...");
                robot.keyTap("enter");
            }, 30000);
        }
    });
}

function tcpClient(d) {
    var client = new net.Socket();
    client.connect(config.TCPClientPort, config.NodeRedTCPHost, function () {

    });

    client.on('connect', function () {
        console.log('Send Client: connection established with server');
    });

    client.setEncoding('utf8');

    client.on('data', function (data) {
        console.log('Data from server:' + data);
    });
    client.end(d);

    client.on("end", () => { // close everything when done
        console.log("disconnected");
    })
}

function prepareWindow() {
    // create foreign function
    const user32 = new ffi.Library('user32', {
        'GetTopWindow': ['long', ['long']],
        'FindWindowA': ['long', ['string', 'string']],
        'SetActiveWindow': ['long', ['long']],
        'SetForegroundWindow': ['bool', ['long']],
        'BringWindowToTop': ['bool', ['long']],
        'ShowWindow': ['bool', ['long', 'int']],
        'SwitchToThisWindow': ['void', ['long', 'bool']],
        'GetForegroundWindow': ['long', []],
        'AttachThreadInput': ['bool', ['int', 'long', 'bool']],
        'GetWindowThreadProcessId': ['int', ['long', 'int']],
        'SetWindowPos': ['bool', ['long', 'long', 'int', 'int', 'int', 'int', 'uint']],
        'SetFocus': ['long', ['long']]
    });

    var kernel32 = new ffi.Library('Kernel32.dll', {
        'GetCurrentThreadId': ['int', []]
    });

    var scumWindow = user32.FindWindowA(null, "SCUM  ");
    var foregroundHWnd = user32.GetForegroundWindow();
    var currentThreadId = kernel32.GetCurrentThreadId();
    var windowThreadProcessId = user32.GetWindowThreadProcessId(foregroundHWnd, null);
    var showWindow = user32.ShowWindow(scumWindow, 9);
    var setWindowPos = user32.SetWindowPos(scumWindow, 0, -1, -1, 800, 500, 0x4000 | 0x0020 | 0x0020 | 0x0040);
    //var setWindowPos2 = user32.SetWindowPos(scumWindow, -2, 0, 0, 0, 0, 3);
    var setForegroundWindow = user32.SetForegroundWindow(scumWindow);
    var attachThreadInput = user32.AttachThreadInput(windowThreadProcessId, currentThreadId, 0);
    var setFocus = user32.SetFocus(scumWindow);
    var setActiveWindow = user32.SetActiveWindow(scumWindow);

    console.log("Scum Window Position and Size set.");
}

function continueGame() {
    const myPromise = new Promise((resolve, reject) => {
        prepareWindow();
        resolve();
    });
    myPromise.then(function () {
        setTimeout(() => {
            robot.moveMouse(387, 270);
            robot.mouseClick();
            robot.mouseClick();
            setTimeout(() => {
                robot.moveMouse(104, 301);
                setTimeout(() => {
                    robot.mouseClick();
                    robot.mouseClick();
                }, 1000);
            }, 1000);
        }, 3000);
    }, function () {
        console.log("Promise Failed");
    });
}

function continueGameInit() {
    const myPromise = new Promise((resolve, reject) => {
        prepareWindow();
        resolve();
    });
    myPromise.then(function () {
        setTimeout(() => {
            robot.moveMouse(387, 270);
            robot.mouseClick();
            robot.mouseClick();
            setTimeout(() => {
                robot.keyTap("d", "control");
                setTimeout(() => {
                    robot.moveMouse(104, 301);
                    setTimeout(() => {
                        robot.mouseClick();
                        robot.mouseClick();
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 3000);
    }, function () {
        console.log("Promise Failed");
    });
}