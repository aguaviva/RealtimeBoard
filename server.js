#!/usr/bin/env nodejs

// http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/
"use strict";

// Optional. You will see this name in eg. 'ps' or 'top' command
process.title = 'node-chat';

// Port where we'll run the websocket server
var webSocketsServerPort = 1337;

// websocket and http servers
var fs = require('fs');
var http = require('http');
var webSocketServer = require('websocket').server;

//////////////////////////////////////////////////////////////////////
// Globals

var history = [ ];  // latest 100 messages
var clients = {};   // list of currently connected clients (users)
var id = 0;         // id incremental counter so each client has a different id
var needCanvas = [];

// Array with some colors
var colors = [ 'red', 'green', 'blue', 'magenta', 'purple', 'plum', 'orange' ];

function escapeString(str) 
{
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

//////////////////////////////////////////////////////////////////////
// HTTP server

var server = http.createServer(function(request, response) 
{
    fs.readFile("RealtimeBoard.html", function(error, content)
    {
        response.writeHead(200, { 'Content-Type': "text/html" });
        response.end(content, 'utf-8');
    });
});

server.listen(webSocketsServerPort, function() 
{
    console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});

var wsServer = new webSocketServer({ httpServer: server });

//////////////////////////////////////////////////////////////////////
// On new connection

wsServer.on('request', function(request) 
{
    var myId = id++;

    console.log((new Date()) + '  ' + myId + ' Connection from origin ' + request.origin + '.');

    // accept connection - you should check 'request.origin' to make sure that
    // client is connecting from your website
    // (http://en.wikipedia.org/wiki/Same_origin_policy)
    var connection = request.accept(null, request.origin); 
    
    function getEnvelope(type, userName, userColor, message)
    {
        return  {
            type: type,
            time: (new Date()).getTime(),
            text: escapeString(message),
            author: userName,
            color: userColor
        };
    }

    function broadcast(type, userName, userColor, message)
    {
        var obj = getEnvelope(type, userName, userColor, message);

        // broadcast message to all connected clients
        var json = JSON.stringify(obj);
        for (var key in clients) 
        {
            clients[key].connection.sendUTF(json);
        }
        
        return obj;
    }
    
    function broadcastSystem(message) 
    {
        broadcast("chat", "<b>system</b>", "black", message)
    }

    // user sent some message
    connection.on('message', function(message) 
    {
        try
        {
            if (message.type === 'utf8') 
            {
                var json = JSON.parse(message.utf8Data);

                var client = clients[myId];
                var ids = Object.keys(clients);
    
                if (client === undefined) 
                { 
                    // first message sent by user is their name, reply with assigned color
                    var userName = escapeString(json.data); //get chosen username
                    var userColor = colors.shift(); // assign the client a color
                    
                    console.log((new Date()) + ' User is known as: ' + userName + ' with ' + userColor + ' color.');

                    // tell everyone we have a new user
                    broadcastSystem(userName + " has joined the chat");

                    // add client to database
                    clients[myId]={"connection" : connection, "userName" : userName, "userColor" : userColor};
                    
                    // tell client what color to use
                    connection.sendUTF(JSON.stringify({ type:'color', data: userColor }));

                    // send back chat history
                    if (history.length > 0) 
                        connection.sendUTF(JSON.stringify( { type: 'history', data: history } ));
    
                    //ask first client for the background, once we get the binary blob forward it to the new client
                    if (ids.length>0)
                    {
                        clients[ids[0]].connection.sendUTF(JSON.stringify({ type:'getCanvas', data: "" }));
                        needCanvas.push(myId); // add ourselves to the list of clients taht want to receive teh background
                    }
                } 
                else 
                { 
                    // broadcast message to everyone
                    var obj = broadcast(json.type, client.userName, client.userColor, json.data)
                    
                    // if it was a message from the chat add it to the history
                    if (json.type=="chat")
                    {
                        // we want to keep history of the last 100 messages
                        history.push(obj);
                        history = history.slice(-100);
                    }
                }
            }
            else if (message.type === 'binary')
            {
                for(var i=0;i<needCanvas.length;i++)
                    clients[needCanvas[i]].connection.sendBytes(message.binaryData);

                needCanvas=[]
            }
        } 
        catch (e) 
        {
            console.log((new Date()) + ' Bad received Message from ' + id + ': ' + message.utf8Data);
            connection.sendUTF(JSON.stringify({ type:'error', data: "Invalid JSON" }));
        } 
    });

    // user disconnected
    connection.on('close', function(connection) 
    {
        var client = clients[myId];
        colors.push(client.userColor);
        delete clients[myId];
        broadcastSystem(client.userName + " has left the chat");
    });

});