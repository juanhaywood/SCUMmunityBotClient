var robot = require("robotjs");//TODO Fix Typing Speed Issue with Fork
var net = require('net');
var fs = require('fs');
Tail = require('tail').Tail;
var ini = require('ini');
var gameStateInit;
var gameState;
var client = new net.Socket();
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
//const degreeType = config.degreeType;

tailInit();//Initial tail to get latest gameState

function tailInit() {
  const filePath = process.env.LOCALAPPDATA + '\\SCUM\\Saved\\Logs\\SCUM.log';
  var options = { fromBeginning: true };//if bot client is closed and reopened, it can get latest state from log file
  tail = new Tail(filePath, options);
  //Begin Tail
  tail.on("line", function (data) {

    if (data.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'")) {
      gameStateInit = "In Main Menu";
    } else if (data.includes("LogExit: Exiting") || data.includes("LogExit: Executing StaticShutdownAfterError")) {
      gameStateInit = "Closed";
    }
  });
}

function tailMain() {
  const filePath = process.env.LOCALAPPDATA + '\\SCUM\\Saved\\Logs\\SCUM.log';
  var options = { fromBeginning: false };
  tail = new Tail(filePath, options);
  //Begin Tail
  tail.on("line", function (data) {
    
    //If at main menu, and previous location was NOT in-game, prepare window, enter bot mode, and continue game.
    if (data.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'") && gameState != "In Game") {
      console.log("State Change: " + gameState + " -> " + "In Main Menu");
      gameState = "In Main Menu";
      console.log("-> Running 'Start' Tasks");
      prepareWindow();
      //tcpServer();
      continueGameInit();

    } 
    
    //If at main menu, and previous location WAS in-game, prepare window, and continue game.
    else if (data.includes("LogLoad: Game class is 'BP_MainMenuGameMode_C'") && gameState == "In Game") {
      console.log("State Change: " + gameState + " -> " + "In Main Menu");
      gameState = "In Main Menu";
      console.log("-> Running 'Resume' Tasks");
      prepareWindow();
      destroyConnection();
      //tcpServerEnd();
      continueGame();
      //need to do check to see if succesfully change, i.e. when server is down. If not, wait 10 secs then retry.

      // do {
      //   console.log ("Retry test");
      //   continueGame();
      //   setTimeout('', 30000);
      // }
      // while (gameState != "In Game");

      // while (gameState != "In Game"){
      //   setTimeout(() => {
      //     console.log ("Did not connect to game server, retrying.");
      //     continueGame(); 
      //   }, 30000);
        

      // }

    } else if (data.includes("LogExit: Exiting") || data.includes("LogExit: Executing StaticShutdownAfterError")) {
      console.log("State Change: " + gameState + " -> " + "Closed");
      gameState = "Closed";
      console.log("-> Running 'Closed' Tasks");
      destroyConnection();
      //Close TCP Server

    } else if (data.includes("LogSCUM: APrisoner::HandlePossessedBy:")) { 
      console.log("State Change: " + gameState + " -> " + "In Game");
      gameState = "In Game";
      console.log ("Should be In Game: " + gameState);
      console.log("-> Running 'In Game' Tasks");
      //Wait 5 seconds, then send "T" to open chat window.
      setTimeout(() => {
        robot.keyTap("t");
        robot.typeString("SCUMmunity Bot Initializing...");
        robot.keyTap("enter");
      }, 5000);
      tcpServer();
    }
  });
}

setTimeout(() => {
gameState = gameStateInit;
tailMain();
console.log("Game Init State: " + gameState);

//Now run initial tasks
if (gameState == "In Main Menu") {
  console.log("-> Running Initial 'Start' Tasks");
  prepareWindow();
  continueGameInit();
} else if (gameState == "Closed" || "Undefined") {
  console.log("-> Running Initial 'Closed' Tasks");
  testExternalApp();
  //Start Game
} else if (gameState == "In-Game") {
  console.log("-> Running Initial 'In-Game' Tasks");
  //Wait 5 seconds, then send "T" to open chat window.
  setTimeout(() => {
    robot.keyTap("t");
    robot.typeString("SCUMmunity Bot Initializing...");
    robot.keyTap("enter");
  }, 5000);
  tcpServer();
  //Ready for commands
  
}
}, 5000);



function tcpServer() {

  //var client = new net.Socket();
  client.connect(config.NodeRedTCPPort, config.NodeRedTCPHost, function() {
    console.log('Connected');
    client.write('Hello, server! Love, Client.');
  });
  client.on('data', onConnData);
  
  // client.on('data', function(data) {
  //   console.log('Received: ' + data);
  
  // });
  
  client.on('close', function() {
    console.log('Connection closed');
  });
}
//SCUM chat default input pos is x:60 y:240
function onConnData(d) {
  console.log('connection data : ', d);
  const robotPayload = JSON.parse(d);
  switch (robotPayload.type) {
    case "moveMouse":
      robot.moveMouse(robotPayload.args.x, robotPayload.args.y);
      break;
    case "getMousePos":
      var mouse = robot.getMousePos();
      console.log("Mouse is at x:" + mouse.x + " y:" + mouse.y);
      break;
    case "typeString":
      robot.moveMouse(60, 240);
      robot.mouseClick();
      robot.typeString(robotPayload.args);
      robot.keyTap("enter");
      break;
    case "keyTap":
      robot.keyTap(robotPayload.args);
      break;
    default:
      console.log("I have never heard of that fruit...");
      console.log(robotPayload);
  }
}

function destroyConnection(){
  client.destroy();
}


function prepareWindow() {
  const ffi = require('ffi-napi');
  setTimeout(() => {
    // create foreign function
    const user32 = new ffi.Library('user32', {
      'FindWindowA': ['long', ['string', 'string']],
      'ShowWindow': ['bool', ['long', 'int']],
      'GetWindowRect': ['bool', ['long', 'pointer']],
      'SetWindowPos': ['bool', ['long', 'long', 'int', 'int', 'int', 'int', 'uint']]
    });

    // create rectangle from pointer
    const pointerToRect = function (rectPointer) {
      const rect = {};
      rect.left = rectPointer.readInt16LE(0);
      rect.top = rectPointer.readInt16LE(4);
      rect.right = rectPointer.readInt16LE(8);
      rect.bottom = rectPointer.readInt16LE(12);
      return rect;
    }

    // obtain window dimension
    const getWindowDimensions = function (handle) {
      const rectPointer = Buffer.alloc(16);
      const getWindowRect = user32.GetWindowRect(handle, rectPointer);
      return !getWindowRect
        ? null
        : pointerToRect(rectPointer);
    }


    // get active window
    //for scum, note the spaces in "SCUM  ". Took me a whole fucking day to figure out why just "SCUM" wasn't being found...
    const scumWindow = user32.FindWindowA(null, "SCUM  ");

    console.log("Active Window: " + scumWindow);
    // get window dimension
    const scumWindowDimensions = getWindowDimensions(scumWindow);

    // force active window to restore mode
    user32.ShowWindow(scumWindow, 9);

    // set window position and size
    user32.SetWindowPos(
      scumWindow,
      0,
      -1,
      -1,
      800,
      500,
      0x4000 | 0x0020 | 0x0020 | 0x0040
    );

  }, 5000);
}

function continueGameInit() {
  setTimeout(() => {
    robot.moveMouse(387, 270);
    robot.mouseClick();
  setTimeout(() => {
    robot.moveMouse(104, 150);
    robot.mouseClick();
    setTimeout(() => {
      robot.keyTap("d", "control");
      setTimeout(() => {
        robot.moveMouse(104, 301);
        setTimeout(() => {
          robot.mouseClick();
        }, 1000);
      }, 3000);
    }, 3000);
  }, 5000);
}, 5000);
}

function continueGame() {
  setTimeout(() => {
  robot.moveMouse(387, 270);
  robot.mouseClick();
  setTimeout(() => {
    robot.moveMouse(104, 150);
    robot.mouseClick();
      setTimeout(() => {
        robot.moveMouse(104, 301);
        setTimeout(() => {
          robot.mouseClick();
        }, 1000);
      }, 3000);
  }, 5000);
}, 5000);
}

function testExternalApp(){
  //////////////////////////////////
      
      // http://stackoverflow.com/questions/18183882/node-webkit-how-to-execute-an-exe-file
      // https://github.com/rogerwang/node-webkit/wiki/Clipboard
  
      var execFile = require('child_process').execFile, child;
       child = execFile('G:\\SteamLibrary\\steamapps\\common\\SCUM\\SCUM_Launcher.exe', function(error,stdout,stderr) { //Find way to launch relative to user
          if (error) {
            //console.log(error.stack); 
            //console.log('Error code: '+ error.code); 
            //console.log('Signal received: '+ 
            //       error.signal);
            }
            //console.log('Child Process stdout: '+ stdout);
            //console.log('Child Process stderr: '+ stderr);
        }); 
        child.on('exit', function (code) { 
          //console.log('Child process exited '+
          //    'with exit code '+ code);
          //alert('exit');
          // Load native UI library
          var gui = require('nw.gui');
          var clipboard = gui.Clipboard.get();
          var text = clipboard.get('text');
          alert(text);

        });
      ///////////////////////////////////
};