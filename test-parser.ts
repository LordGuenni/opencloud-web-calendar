import { XMLParser } from 'fast-xml-parser';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">
  <response>
    <href>/caldav/user/cal/</href>
    <propstat>
      <prop>
        <displayname>Personal</displayname>
        <resourcetype><collection/><C:calendar/></resourcetype>
        <current-user-privilege-set>
          <privilege><read/></privilege>
          <privilege><write/></privilege>
          <privilege><write-properties/></privilege>
          <privilege><write-content/></privilege>
          <privilege><all/></privilege>
        </current-user-privilege-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'response'
});

const parsed = parser.parse(xml);
const prop = parsed.multistatus.response[0].propstat.prop;
console.log("Prop:", JSON.stringify(prop, null, 2));
