const { promptBucketName, greetMessageBucketName } = require("./config/Constants");
const { getSessionData, storeSessionData } = require("./data/CallSessionData");
const { getObjectFromS3 } = require("./services/AWS/S3");
const { getPollyStreams } = require("./services/Synthesis/Polly");
// const { hangupCall } = require("./services/Telephony/Plivo");
const { deepgramEvents, createDeepgramConnection } = require("./services/Transcribe/Deepgram");
const {
  clearWsClient,
  sendMediaEvent,
  processCallOutcome,
} = require("./utils/Helper");
/**
 * Initializes websocket to specify actions to be performed.
 * @param {Websocket Connection} wss - The websocket which needs to be initialized.
 */

function initializeWebSocket(wss) {
  wss.on("connection", async function connection(ws) {
    console.log("New Connection Initiated");


      let randomNumber = Math.random().toString()
      await makeOutboundCall(randomNumber)
      
      // on Start
      ws.sessionData = initializeSessionData(
      randomNumber
    );
    deepgramEvents(
      ws,
      ws.sessionData.deepgramConnection,
      ws.sessionData.index
    );
    console.log(`Starting Media Stream`);
    
    sendGreetMessage(ws.sessionData.greetMessage, ws);
   
    // //Handling websocket messages from clients
    ws.on("message", async function incoming(message) {
      // const msg = Buffer.from(message, "base64")
      console.log('message received')
      // console.log(msg)
      ws.sessionData.deepgramConnection.send(message);
    });

    ws.on("error", function (error) {
      console.error("WebSocket Error:", error);
    });

    ws.on("close", async function (code) {
      // Process CallOutcome and update to dynamo
      // await processCallOutcome(ws.sessionData);
      // console.log(`Call Outcome updated`);

      console.log(`Websocket connection closed: ${code}`);
      // cleanupSocketSession(ws);
    });
  });
}

// CleanUp Web socket session Data
function cleanupSocketSession(ws) {
  if (ws.sessionData) {
    if (ws.sessionData.deepgramConnection) {
      ws.sessionData.deepgramConnection.finish();
      ws.sessionData.deepgramConnection = null;
    }
    ws.sessionData = null;
  }
}

// Inisiating a web socket sessiondata setup
const makeOutboundCall = async (callSid) => {
  const  clientId = "general"
  const promptFileName =  "GeneralPrompt.txt"
  // const greetMessageFileName = "CollegeIntroduction.txt"

  
  //Generating object keys for prompt and greet message
  const promptObjectKey = clientId + "/" + promptFileName;
  // const greetMessageObjectKey = clientId + "/" + greetMessageFileName;
  
  try {
    // Fetching client specific prompt
    let prompt = await getObjectFromS3(promptBucketName, promptObjectKey);

    //Fetching client specific greet message
    // const greetMessage = await getObjectFromS3(
    //   greetMessageBucketName,
    //   greetMessageObjectKey
    // );

    //Creating deepgram connection
    const { deepgramConnection, index } = await createDeepgramConnection();

    setInterval(() => {
      deepgramConnection.keepAlive();
    }, 3000);


    //Storing session specific data
    const currentCallSessionData = {
      deepgramConnection: deepgramConnection,
      prompt: prompt,
      greetMessage: 'Hello Abhay, How was your day? Lets start with your Backend interview.',
      index: index,
    };
 
    storeSessionData(callSid, currentCallSessionData);

    //Sending a response back to calling function
    // const response = {
    //   message: "Call registered successfully!",
    // };
    // res.send(response);
  } catch (error) {
    // Pushing error to cloudwatch
    console.log(error);
    // const response = {
      // message: "Failed to initiate the call!",
    // };
    // res.status(500).send(response);
  }
};



/**
 * Initializes session data for a given websocket client.
 * @param {Websocket Connection} ws - The websocket client for which session data needs to be initialized.
 */

function initializeSessionData(callSid) {
  const currentCallSessionData = getSessionData(callSid);
  const sessionData = {
    callSID: callSid,
    isInterruptionDetected: false,
    currentAssistantMessage: currentCallSessionData.greetMessage,
    deepgramConnection: currentCallSessionData.deepgramConnection,
    messageContent: [
      { role: "system", content: currentCallSessionData.prompt },
    ],
    greetMessage: currentCallSessionData.greetMessage,
    index: currentCallSessionData.index,
   };

  return sessionData;
}

/**
 * Sends a greet message to a client.
 * @param {Websocket Connection} ws - The websocket client for which we need to send greet message.
 * @param {String} greetMessage - The greet message that needs to be sent.
 */

function sendGreetMessage(greetMessage, ws) {
  getPollyStreams(greetMessage).then((data) => {
    // clearWsClient(ws);
    sendMediaEvent(ws, data);
    // ws.send(data)
  });
}

module.exports = { initializeWebSocket };
