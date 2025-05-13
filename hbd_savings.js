require('dotenv').config();

const dhive = require('@hiveio/dhive');
const fs = require('fs');
const path = require('path');

//main const
const client = new dhive.Client(['https://api.hive.blog']);
const username = process.env.HIVE_USERNAME;
const activeKey = dhive.PrivateKey.fromString(process.env.HIVE_ACTIVE_KEY);

function isHiveYesterday(timestamp) {
    const rewardDate = new Date(timestamp + 'Z'); //Hive timestamp is now in UTC
    const now = new Date();
    const yesterday = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1
    ));

    return rewardDate.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

//Additional function to check if it is today (UTC)
function isHiveToday(timestamp) {
    const rewardDate = new Date(timestamp + 'Z');
    const now = new Date();
    const today = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    ));
    return rewardDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
}

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


////possible improvement => check if there is a pending claim reward and do it first
async function getLastPostReward(author) {

    const history = await client.database.call('get_account_history', [author, -1, 1000]);

    //Internal function to fetch post reward by date
    async function findRewardByDate(dateCheckFn) {

        for (const [_, op] of history.slice().reverse()) {

            if (op.op[0] !== 'author_reward') continue;
            if (op.op[1].author !== author) continue;

            const permlink = op.op[1].permlink;
            const content = await client.database.call('get_content', [author, permlink]);

            if (content.parent_author !== "") continue; //Ignore comments
            if (!dateCheckFn(op.timestamp)) continue; //Check the date

            const amount = parseFloat(op.op[1].hbd_payout.replace(' HBD', ''));

            return { amount, permlink };
        }

        return null;

    }

    // First, try to find yesterday's reward
    log("Checking if there post payment on yesterday's date...")

    const rewardYesterday = await findRewardByDate(isHiveYesterday);
    if (rewardYesterday) return rewardYesterday;

    // If not found, try to find today's reward
    log("Checking if there post payment on today's date...")

    const rewardToday = await findRewardByDate(isHiveToday);

    if (rewardToday) return rewardToday;
 
    log("No post rewards found!")

    return null
}

async function wasAlreadyProcessed(permlink) {
    const history = await client.database.call('get_account_history', [username, -1, 1000]);
    const memoTag = `auto-save:${permlink}`;

    return history.some(([_, op]) =>
        op.op[0] === 'transfer_to_savings' &&
        op.op[1].from === username &&
        op.op[1].memo === memoTag
    );
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

    //get the information from the last post
    const postInfo = await getLastPostReward(username);

    if (postInfo === null) {
        return;
    }

    //the postInfo variable will contain the return of getLastPostReward() with the value and permlink of the post
    const { amount, permlink } = postInfo;

    //validating whether any operation has already been performed on the returned post
    if (await wasAlreadyProcessed(permlink)) {
        log(`Post "${permlink}" already had HBD sent to savings!`);
        return;
    }

    //0 = fixed, 1 = percentage
    const usePercent = process.env.HBD_SEND_MODE === '1';

    if (usePercent) {
        
        const percent = parseFloat(process.env.HBD_PERCENT_VALUE);

        if (percent <= 0) {
            log('HBD_PERCENT_VALUE field cannot be zero or negative.');
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
            log('HBD_FIX_VALUE field cannot be zero or negative.');
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
