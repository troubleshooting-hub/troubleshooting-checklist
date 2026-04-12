log.info(JSON.stringify(request));

const oldTarget = request.target.old;
const newTarget = request.target.new;

async function findChanges(oldObj, newObj, path = '') {
let changes = [];

const modifiedPath = path
    .replace(/urn:ietf:params:scim:schemas:extension:enterprise:2.0:User/g, 'ENT')
    .replace(/urn:ietf:params:scim:schemas:ian:2.0:User/g, 'IAN');

for (const [key, newValue] of Object.entries(newObj)) {
    const oldValue = oldObj[key];
    const currentPath = modifiedPath ? `${modifiedPath}.${key}` : key;

if (typeof newValue === 'object' && newValue !== null) {
        if (Array.isArray(newValue) && Array.isArray(oldValue)) {
            for (let i = 0; i < Math.max(newValue.length, oldValue.length); i++) {
                const newObj = newValue[i];
                const oldObj = oldValue[i];

if (newObj && oldObj && newObj.type === 'work' && oldObj.type === 'work') {
                    for (const attr in newObj) {
                        if (newObj[attr] !== oldObj[attr]) {
                            changes.push({
                                attribute: `${currentPath}[${i}].${attr}`,
                                oldValue: oldObj[attr] !== undefined ? oldObj[attr] : 'undefined',
                                newValue: newObj[attr]
                            });
                        }
                    }
                }
            }
        } else {
            changes = changes.concat(await findChanges(oldValue || {}, newValue, currentPath));
        }
    } else if (newValue !== oldValue) {
        changes.push({
            attribute: currentPath,
            oldValue: oldValue !== undefined ? oldValue : 'undefined',
            newValue: newValue
        });
    }
}

return changes;
}

try {
const changes = await findChanges(oldTarget, newTarget);

let emailBody = `
<html>
<body>
    <h2>The following changes have been detected for user: ${oldTarget.userName}</h2>
    <table style="border-collapse: collapse; width: 100%;">
        <thead>
            <tr>
                <th style="border: 1px solid #dddddd; padding: 8px;">Attribute</th>
                <th style="border: 1px solid #dddddd; padding: 8px;">Old Value</th>
                <th style="border: 1px solid #dddddd; padding: 8px;">New Value</th>
            </tr>
        </thead>
        <tbody>
`;

if (changes.length === 0) {
    emailBody += `
            <tr>
                <td colspan="3" style="border: 1px solid #dddddd; padding: 8px; text-align: center;">
                    No changes detected.
                </td>
            </tr>
`;
} else {
    for (const change of changes) {
        emailBody += `
            <tr>
                <td style="border: 1px solid #dddddd; padding: 8px;">${change.attribute}</td>
                <td style="border: 1px solid #dddddd; padding: 8px;">${change.oldValue}</td>
                <td style="border: 1px solid #dddddd; padding: 8px;">${change.newValue}</td>
            </tr>
    `;
    }
}

emailBody += `
        </tbody>
    </table>
</body>
</html>
`;

let to = ["itdesk@sdp803378382.zm.sdpondemand.com"];

await utils.sendEmail(
    to,
    'User Attribute Changes Detected',
    emailBody,
    'html',
    'noreply@aquera.com'
);

const samChange = changes.find(change => change.attribute === 'IAN.sAMAccountName');

if (samChange) {
    let samEmailBody = `
    <html>
    <body>
        <h2>CFSS Name Change Alert</h2>
        <p>A SAM Account change was detected for user: ${oldTarget.userName}</p>
        <table style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr>
                    <th style="border: 1px solid #dddddd; padding: 8px;">Attribute</th>
                    <th style="border: 1px solid #dddddd; padding: 8px;">Old Value</th>
                    <th style="border: 1px solid #dddddd; padding: 8px;">New Value</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="border: 1px solid #dddddd; padding: 8px;">${samChange.attribute}</td>
                    <td style="border: 1px solid #dddddd; padding: 8px;">${samChange.old}</td>
                    <td style="border: 1px solid #dddddd; padding: 8px;">${samChange.new}</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>
    `;

await utils.sendEmail(
        ["cfss.support@carriageservices.com"],
        "CFSS Name Change Alert",
        samEmailBody,
        "html",
        "noreply@aquera.com"
    );

log.info(`SAM account change detected and CFSS email sent: ${JSON.stringify(samChange)}`);
}

log.info(`Changes detected and email sent: ${JSON.stringify(changes)}`);
} catch (error) {
log.error(`Error finding changes or sending email: ${error.message}`);}