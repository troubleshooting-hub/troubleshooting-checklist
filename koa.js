var ENT = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
var IAN = 'urn:ietf:params:scim:schemas:ian:2.0:User';

log.info(JSON.stringify(request));

let department = SOURCE[ENT].department;
let deptHome = ["ACC","ACQ","CDS","CVT","CMK","COP","CRM","CSX","DEV","CQC","FDS","FSR","GM","HRS","ISD","EDP","KSR","KAM","MAS","MKT","FSL","TER","VAL","VKR"];
let deptCG = ["ALQ","HOG","ASH","BKR","BAR","BEA","BLT","BOS","HAT","CHE","COV","ARL","DAY","DOR","FKY","FTL","GLV","GAT","HIA","JAV","HOU","LAK","CIR","VST","LIV","LOU","LUM","MOA","MYR","MYS","NPL","NAP","NAS","NSH","NIA","FAL","PLD","OKE","ORL","KIS","ORY","PIF","RDB","RNO","RKS","RCK","SCZ","SPI","STP","STK","SUG","SBY","BHW","THO","PHL","TGS","TRI","TUS","VIA","WNT","WYS","YEL","MVH","BLG"];

// -----------------------------
// Helpers
// -----------------------------
function safe(val, fallback) {
    return val ? val : (fallback || "");
}

function getEmailByType(user, type) {
    if (!user || !user.emails || !Array.isArray(user.emails)) return "";
    let emailObj = user.emails.find(function(e) {
        return e && e.type && e.type.toLowerCase() === type.toLowerCase() && e.value;
    });
    return emailObj ? emailObj.value : "";
}

function getManagerWorkEmail(user) {
    if (!user || !user[ENT] || !user[ENT].manager) return "";

    let manager = user[ENT].manager;

    if (manager.email) return manager.email;
    if (manager.workEmail) return manager.workEmail;

    if (manager.emails && Array.isArray(manager.emails)) {
        let workEmail = manager.emails.find(function(e) {
            return e && e.type && e.type.toLowerCase() === "work" && e.value;
        });
        if (workEmail) return workEmail.value;
    }

    return "";
}

function shuffleString(str) {
    let arr = str.split("");
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr.join("");
}

// AD-style password:
// - 14 chars
// - includes uppercase, lowercase, number, special
// - avoids ambiguous chars
// - avoids first/last name fragments if possible
function generateADPassword(user) {
    let upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let lower = "abcdefghijkmnopqrstuvwxyz";
    let numbers = "23456789";
    let special = "@#$%!-_=+?";
    let all = upper + lower + numbers + special;

    function rand(chars) {
        return chars.charAt(Math.floor(Math.random() * chars.length));
    }

    function containsNameFragment(password, value) {
        if (!value) return false;
        let cleaned = value.toLowerCase().replace(/[^a-z]/g, "");
        if (cleaned.length < 3) return false;
        return password.toLowerCase().indexOf(cleaned) !== -1;
    }

    let password = "";
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 20) {
        attempts++;

        password = "";
        password += rand(upper);
        password += rand(lower);
        password += rand(numbers);
        password += rand(special);

        for (let i = 4; i < 14; i++) {
            password += rand(all);
        }

        password = shuffleString(password);

        let givenName = safe(user.name && user.name.givenName);
        let familyName = safe(user.name && user.name.familyName);

        valid =
            !containsNameFragment(password, givenName) &&
            !containsNameFragment(password, familyName);
    }

    return password;
}

// -----------------------------
// Build CN / Target DN
// -----------------------------
let cn;
var attempts = {
    1: (SOURCE.nickName
        ? (SOURCE.nickName.charAt(0).toUpperCase() + SOURCE.nickName.slice(1).toLowerCase())
        : (SOURCE.name.givenName.charAt(0).toUpperCase() + SOURCE.name.givenName.slice(1).toLowerCase()))
        + " " +
        (SOURCE[IAN].preferredLastName
            ? (SOURCE[IAN].preferredLastName.charAt(0).toUpperCase() + SOURCE[IAN].preferredLastName.slice(1).toLowerCase())
            : (SOURCE.name.familyName.charAt(0).toUpperCase() + SOURCE.name.familyName.slice(1).toLowerCase())),

    2: (SOURCE.nickName
        ? (SOURCE.nickName.charAt(0).toUpperCase() + SOURCE.nickName.slice(1).toLowerCase())
        : (SOURCE.name.givenName.charAt(0).toUpperCase() + SOURCE.name.givenName.slice(1).toLowerCase()))
        + " " +
        (SOURCE.name.middleName ? SOURCE.name.middleName[0] : "") +
        (SOURCE[IAN].preferredLastName
            ? (SOURCE[IAN].preferredLastName.charAt(0).toUpperCase() + SOURCE[IAN].preferredLastName.slice(1).toLowerCase())
            : (SOURCE.name.familyName.charAt(0).toUpperCase() + SOURCE.name.familyName.slice(1).toLowerCase()))
};

cn = "CN=" + (
    (%ATTEMPT < 3
        ? attempts[%ATTEMPT]
        : (
            (SOURCE.nickName
                ? (SOURCE.nickName.charAt(0).toUpperCase() + SOURCE.nickName.slice(1).toLowerCase())
                : (SOURCE.name.givenName.charAt(0).toUpperCase() + SOURCE.name.givenName.slice(1).toLowerCase()))
            + " " +
            (SOURCE[IAN].preferredLastName
                ? (SOURCE[IAN].preferredLastName.charAt(0).toUpperCase() + SOURCE[IAN].preferredLastName.slice(1).toLowerCase())
                : (SOURCE.name.familyName.charAt(0).toUpperCase() + SOURCE.name.familyName.slice(1).toLowerCase()))
        ) + (%ATTEMPT < 3 ? "" : %ATTEMPT - 2)
    )
).replace(/[":!@#$%^&*]/gm, "");

if (deptHome.includes(department)) {
    cn += ",OU=Corporate,DC=koa,DC=bil,DC=local";
} else if (deptCG.includes(department)) {
    cn += ",OU=Campgrounds,DC=koa,DC=bil,DC=local";
} else {
    cn += ",OU=Corporate,DC=koa,DC=bil,DC=local";
}

// -----------------------------
// Terminated OU check
// -----------------------------
let terminatedDn = "CN=" + DEST[IAN].cn + ",OU=Terminated,DC=koa,DC=bil,DC=local";
let newDn = cn;

// -----------------------------
// Trigger: moved from Terminated OU to another OU
// -----------------------------
if (terminatedDn.toLowerCase() !== newDn.toLowerCase()) {

    let personalEmail = getEmailByType(SOURCE, "home");
    let managerEmail = getManagerWorkEmail(SOURCE);

    let to = [];
    if (personalEmail) to.push(personalEmail);
    if (managerEmail) to.push(managerEmail);

    let tempPassword = generateADPassword(SOURCE);

    let subject = "New Employee - " + safe(SOURCE.name.givenName) + " " + safe(SOURCE.name.familyName);

    let body = `
Welcome ${safe(SOURCE.name.givenName)} to Kampgrounds of America, Inc. email system.

The information provided in this email will allow you to access your email through our Microsoft 365 Portal. You can proceed by clicking one of the following links:
webmail.koa.net
outlook.office.com
www.office.com

    name     : ${safe(SOURCE.name.givenName)} ${safe(SOURCE.name.familyName)}
    email    : ${safe(getEmailByType(SOURCE, "work"))}
    username : ${safe(SOURCE.userName)}
    password : ${tempPassword}

The password provided is a temporary password and you will be prompted to change the password when you first log into the system. If you have any problems or questions, please contact our support team by opening a ticket at https://koa-it.zendesk.com/ and we will get back to you just as quickly as possible.

© KOA, Inc.
`;

    DEST.password = tempPassword;

    if (to.length > 0) {
        utils.sendEmail(to, subject, body, 'text');
        log.info("New Employee email sent to: " + JSON.stringify(to));
    } else {
        log.warn("No personal email or manager work email found in SOURCE. Email not sent.");
    }
}