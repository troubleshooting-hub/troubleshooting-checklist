log.info(JSON.stringify(request))

let ous = ["OU=Corporate,DC=koa,DC=bil,DC=local","OU=Campgrounds,DC=koa,DC=bil,DC=local" ,]

let oldOu = "OU=Terminated,DC=koa,DC=bil,DC=local";

let userOldOu = request.target.old["urn:ietf:params:scim:schemas:ian:2.0:User"]?.distinguishedName
let trigger = request.target.old["urn:ietf:params:scim:schemas:ian:2.0:User"]?.distinguishedName.some(a => ous.find(userOldOu) )
let persEmail = request.source.emails.find(e => e.type =="home")
let workEmail = request.source.emails.find(e => e.type =="work")


function generatePassword(length, includeSpecialChars) {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const specials = "!@#$%^&*()_+{}[]<>?/";

    let characters = letters + numbers;
    if (includeSpecialChars) {
        characters += specials;
    }

    let password = "";

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        password += characters[randomIndex];
    }

    return password;
}

let pass = generatePassword(12, "!$#%");

   let subject = `New Employee - ${request.source.name.givenName} ${request.source.name.familyName}`;

let body = `Welcome ${request.source.name.givenName} to Kampgrounds of America, Inc. email system.

The information provided in this email will allow you to access your email through our Microsoft 365 Portal. You can proceed by clicking one of the following links: webmail.koa.net, outlook.office.com or www.office.com

name     : ${request.source.name.givenName} ${request.source.name.familyName}
email    : ${workEmail}
username : ${request.target.new.userName}
password : ${pass}

The password provided is a temporary password and you will be prompted to change the password when you first log into the system. If you have any problems or questions, please contact our support team by opening a ticket at https://koa-it.zendesk.com/ and we will get back to you just as quickly as possible.

© KOA, Inc.`

if (request?.source?.active == true && request?.target?.old?.active == false & request?.target?.new?.active == true && userOldOu.includes("OU=Terminated,DC=koa,DC=bil,DC=local") && trigger){



    let user = {
        password: pass
    }
    let res = aad.putUser(request?.target?.old?.id, user)


utils.sendemail(persEmail,subject,body)


}

