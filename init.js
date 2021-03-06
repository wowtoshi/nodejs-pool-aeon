"use strict";
let mysql = require("promise-mysql");
let fs = require("fs");
let argv = require('minimist')(process.argv.slice(2));
let config = fs.readFileSync("./config.json");
let coinConfig = fs.readFileSync("./coinConfig.json");
let protobuf = require('protocol-buffers');

global.support = require("./lib/support.js")();
global.config = JSON.parse(config);
global.mysql = mysql.createPool(global.config.mysql);
global.protos = protobuf(fs.readFileSync('./lib/data.proto'));
let comms;
let coinInc;

// Config Table Layout
// <module>.<item>

global.mysql.query("SELECT * FROM config").then(function (rows) {
    rows.forEach(function (row){
        if (!global.config.hasOwnProperty(row.module)){
            global.config[row.module] = {};
        }
        if (global.config[row.module].hasOwnProperty(row.item)){
            return;
        }
        switch(row.item_type){
            case 'int':
                global.config[row.module][row.item] = parseInt(row.item_value);
                break;
            case 'bool':
                global.config[row.module][row.item] = (row.item_value === "true");
                break;
            case 'string':
                global.config[row.module][row.item] = row.item_value;
                break;
            case 'float':
                global.config[row.module][row.item] = parseFloat(row.item_value);
                break;
        }
    });
}).then(function(){
    global.config['coin'] = JSON.parse(coinConfig)[global.config.coin];
    coinInc = require(global.config.coin.funcFile);
    global.coinFuncs = new coinInc();
    if (argv.module === 'pool'){
        comms = require('./lib/remote_comms');
    } else {
        comms = require('./lib/local_comms');
    }
    global.database = new comms();
    global.database.initEnv();
    global.coinFuncs.blockedAddresses.push(global.config.pool.address);
    global.coinFuncs.blockedAddresses.push(global.config.payout.feeAddress);
    switch(argv.module){
        case 'pool':
            global.config.ports = [];
            global.mysql.query("SELECT * FROM port_config").then(function(rows){
                rows.forEach(function(row){
                    row.hidden = row.hidden === 1;
                    row.ssl = row.ssl === 1;
                    global.config.ports.push({
                        port: row.poolPort,
                        difficulty: row.difficulty,
                        desc: row.portDesc,
                        portType: row.portType,
                        hidden: row.hidden,
                        ssl: row.ssl
                    });
                });
            }).then(function(){
                require('./lib/pool.js');
            });
            break;
        case 'blockManager':
            require('./lib/blockManager.js');
            break;
        case 'payments':
            require('./lib/payments.js');
            break;
        case 'api':
            require('./lib/api.js');
            break;
        case 'remoteShare':
            require('./lib/remoteShare.js');
            break;
        case 'worker':
            require('./lib/worker.js');
            break;
        case 'longRunner':
            require('./lib/longRunner.js');
            break;
        default:
            console.error("Invalid module provided.  Please provide a valid module");
            process.exit(1);
    }
});