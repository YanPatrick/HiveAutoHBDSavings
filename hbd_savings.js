require('dotenv').config();

const dhive = require('@hiveio/dhive');
const fs = require('fs');
const path = require('path');

//main const
const client = new dhive.Client(['https://api.hive.blog']);
const username = process.env.HIVE_USERNAME;
const activeKey = dhive.PrivateKey.fromString(process.env.HIVE_ACTIVE_KEY);

function log(msg) {
  
    const now = new Date();
    const timestamp = now.toISOString();
    const dia = String(now.getUTCDate()).padStart(2, '0');
    const mes = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ano = String(now.getUTCFullYear());
    
    const logDir = path.join(__dirname, 'log');
    
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }
    
    const logFile = path.join(logDir, `hbd_savings_log_${dia}${mes}${ano}.txt`);
    const fullMsg = `[${timestamp}] ${msg}\n`;

    fs.appendFileSync(logFile, fullMsg);
    
    console.log(fullMsg.trim());
}

function getUTCDateString(daysAgo = 0) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date.toISOString().split('T')[0]; // retorna YYYY-MM-DD
}

////possible improvement => check if there is a pending claim reward and do it first
async function getLastPostReward(hiveUser) {
    let start = -1;
    let processedOps = 0;
    const limiteMax = 10000;
    const todayUTC = getUTCDateString(0);
    const yesterdayUTC = getUTCDateString(1);
    const done =false

    while (processedOps < limiteMax) {

        const batchSize = 1000;

        const history = await client.database.call('get_account_history', [hiveUser, start, batchSize]);

        if (!history || history.length === 0) break;

        for (const [index, entry] of history.slice().reverse()) {

            const [opType, opData] = entry.op;
            const timestamp = entry.timestamp.split('T')[0];
            
            start = index - 1;
            processedOps++;

            if (timestamp < yesterdayUTC) {
                log(`Verification date (${timestamp}) less than yesterday's (${yesterdayUTC}). No postback found!`);
                done = true;
                break;
            }

            if (timestamp !== todayUTC && timestamp !== yesterdayUTC) continue;
            if (opType !== 'author_reward') continue;
            if (opData.author !== hiveUser) continue;

            const permlink = opData.permlink;

            const content = await client.database.call('get_content', [hiveUser, permlink]);

            if (content.parent_author !== "") continue;

            log(`Checking if already processed for ${permlink}`);

            if (await wasAlreadyProcessed(permlink)) {
                log(`Post "${permlink}" already had HBD sent to savings!`);
                continue;
            }

            const amount = parseFloat(opData.hbd_payout.replace(' HBD', ''));

            return { amount, permlink };
        }
    }

    log("No post rewards found for yesterday or today (UTC).");

    return null;
}

async function wasAlreadyProcessed(permlink) {
    const memoTag = `auto-save:${permlink}`;
    let start = -1;
    const batchSize = 1000;
    const limiteMax = 10000; // safety limit to not seek infinity
    let totalChecked = 0;

    while (totalChecked < limiteMax) {

        const history = await client.database.call('get_account_history', [username, start, batchSize]);

        if (!history || history.length === 0) break;

        for (const [index, entry] of history) {
            start = index - 1;
            totalChecked++;

            const [opType, opData] = entry.op;

            if (
                opType === 'transfer_to_savings' &&
                opData.from === username &&
                opData.memo === memoTag
            ) {
                return true;
            }
        }
    }

    return false;
}

async function sendToSavings(amount, permlink) {

    const memo = `auto-save:${permlink}`;
    
    const op = ['transfer_to_savings', {
        from: username,
        to: username,
        amount: `${amount.toFixed(3)} HBD`,
        memo
    }];

    const tx = {
        operations: [op],
        extensions: []
    };

    try {

        //send the operation to stake HBD here.
        await client.broadcast.sendOperations(tx.operations, activeKey);

        log(`Sent ${amount.toFixed(3)} HBD to savings with memo "${memo}".`);

    } catch (err) {
        //v25.5.2 16/05/2025
        log("Error sending to savings: " + err.message);
    }
}

async function main() {

    log(`Validating configuration parameters...`);

    if (username.trim() === "" || username.trim() === "your_hive_user") {
        log('HIVE_USERNAME field is empty or not set in .env file! Cannot continue!');
        process.exit(1);
    }

    if (activeKey === "" || activeKey === "your_private_key") {
        log('HIVE_ACTIVE_KEY field is empty or not set in .env file! Cannot continue!');
        process.exit(1);
    }

    log(`Configuration parameters OK!`);

    //get the information from the last post
    const postInfo = await getLastPostReward(username);

    if (postInfo === null) {
        return;
    }

    //the postInfo variable will contain the return of getLastPostReward() with the value and permlink of the post
    const { amount, permlink } = postInfo;

    //0 = fixed, 1 = percentage
    const usePercent = process.env.HBD_SEND_MODE === '1';

    if (usePercent) {
        
        const percent = parseFloat(process.env.HBD_PERCENT_VALUE);

        if (percent <= 0) {
            log('HBD_PERCENT_VALUE field cannot be zero or negative! Cannot continue!');
            process.exit(1);
        }
    
        if (!percent || isNaN(parseFloat(percent))) {
            log('Invalid HBD_PERCENT_VALUE field in .env file! Cannot continue!');
            process.exit(1);
        }

        valueToSavings = amount * (percent / 100);

    } else {
        
        //search for the fixed transfer amount per post, for example 1 hbd
        hbdFixValue = parseFloat(process.env.HBD_FIX_VALUE);

        if (hbdFixValue <= 0) {
            log('HBD_FIX_VALUE field cannot be zero or negative! Cannot continue!');
            process.exit(1);
        }
    
        if (!hbdFixValue || isNaN(parseFloat(percent))) {
            log('Invalid HBD_FIX_VALUE field in .env file! Cannot continue!');
            process.exit(1);
        }

        //if the value is greater than the post return, abort
        if (hbdFixValue > amount) {
            log("Fixed value greater than reward! Aborting!");
            return;
        }

        valueToSavings = hbdFixValue
    }

    await sendToSavings(valueToSavings, permlink);
}

main();
