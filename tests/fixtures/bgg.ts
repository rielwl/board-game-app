/**
 * Recorded-shape BoardGameGeek XML API2 responses, trimmed to the fields the
 * parser reads. The malformed variants exist so the "parse defensively"
 * requirement is actually exercised rather than asserted.
 */

export const THING_XML = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="13">
    <thumbnail>https://cf.geekdo-images.com/catan-thumb.png</thumbnail>
    <image>https://cf.geekdo-images.com/catan.png</image>
    <name type="primary" sortindex="1" value="CATAN" />
    <name type="alternate" sortindex="1" value="Die Siedler von Catan" />
    <description>Trade, build, settle.</description>
    <yearpublished value="1995" />
    <minplayers value="3" />
    <maxplayers value="4" />
    <poll name="suggested_numplayers" title="User Suggested Number of Players" totalvotes="1200">
      <results numplayers="1">
        <result value="Best" numvotes="1" />
        <result value="Recommended" numvotes="3" />
        <result value="Not Recommended" numvotes="700" />
      </results>
      <results numplayers="3">
        <result value="Best" numvotes="300" />
        <result value="Recommended" numvotes="900" />
        <result value="Not Recommended" numvotes="200" />
      </results>
      <results numplayers="4">
        <result value="Best" numvotes="1400" />
        <result value="Recommended" numvotes="400" />
        <result value="Not Recommended" numvotes="60" />
      </results>
      <results numplayers="4+">
        <result value="Best" numvotes="0" />
        <result value="Recommended" numvotes="10" />
        <result value="Not Recommended" numvotes="800" />
      </results>
    </poll>
    <playingtime value="120" />
    <minplaytime value="60" />
    <maxplaytime value="120" />
    <minage value="10" />
    <link type="boardgamecategory" id="1021" value="Economic" />
    <link type="boardgamecategory" id="1026" value="Negotiation" />
    <link type="boardgamemechanic" id="2072" value="Dice Rolling" />
    <link type="boardgamemechanic" id="2008" value="Trading" />
    <link type="boardgameexpansion" id="926" value="CATAN: Cities &amp; Knights" />
    <statistics page="1">
      <ratings>
        <usersrated value="130000" />
        <average value="7.11" />
        <bayesaverage value="6.94" />
        <averageweight value="2.3" />
        <numweights value="20000" />
      </ratings>
    </statistics>
  </item>
  <item type="boardgameexpansion" id="926">
    <name type="primary" sortindex="1" value="CATAN: Cities &amp; Knights" />
    <yearpublished value="1998" />
    <minplayers value="3" />
    <maxplayers value="4" />
    <playingtime value="120" />
    <link type="boardgameexpansion" id="13" value="CATAN" inbound="true" />
    <link type="boardgamemechanic" id="2072" value="Dice Rolling" />
    <statistics page="1">
      <ratings>
        <usersrated value="30000" />
        <average value="7.4" />
        <bayesaverage value="7.2" />
        <averageweight value="3.0" />
        <numweights value="4000" />
      </ratings>
    </statistics>
  </item>
</items>`;

/** No statistics block, no polls, no year, and a zeroed year attribute. */
export const THING_SPARSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="999901">
    <name type="primary" sortindex="1" value="Attic Find" />
    <yearpublished value="0" />
    <minplayers value="3" />
    <maxplayers value="5" />
    <minplaytime value="0" />
    <link type="boardgamemechanic" id="2009" value="Trick-taking" />
  </item>
</items>`;

/** An item with no id, and an item with no name: both must be skipped. */
export const THING_JUNK_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame">
    <name type="primary" value="No id here" />
  </item>
  <item type="boardgame" id="4242" />
  <item type="boardgame" id="7">
    <name type="primary" value="Survivor" />
    <minplayers value="2" />
    <maxplayers value="4" />
  </item>
</items>`;

export const SEARCH_XML = `<?xml version="1.0" encoding="utf-8"?>
<items total="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="13">
    <name type="primary" value="CATAN" />
    <yearpublished value="1995" />
  </item>
  <item type="boardgame" id="13">
    <name type="alternate" value="Catan" />
    <yearpublished value="1995" />
  </item>
  <item type="boardgameexpansion" id="926">
    <name type="primary" value="CATAN: Cities &amp; Knights" />
    <yearpublished value="1998" />
  </item>
</items>`;

export const COLLECTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<items totalitems="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item objecttype="thing" objectid="13" subtype="boardgame" collid="111">
    <name sortindex="1">CATAN</name>
    <yearpublished>1995</yearpublished>
    <status own="1" prevowned="0" fortrade="0" want="0" wishlist="0" />
  </item>
  <item objecttype="thing" objectid="30549" subtype="boardgame" collid="112">
    <name sortindex="1">Pandemic</name>
    <yearpublished>2008</yearpublished>
    <status own="1" prevowned="0" fortrade="0" want="0" wishlist="0" />
  </item>
  <item objecttype="thing" objectid="167791" subtype="boardgame" collid="113">
    <name sortindex="1">Terraforming Mars</name>
    <yearpublished>2016</yearpublished>
    <status own="0" prevowned="0" fortrade="0" want="0" wishlist="1" wishlistpriority="2" />
  </item>
</items>`;

/** A single-item collection: fast-xml-parser will not produce an array here. */
export const COLLECTION_SINGLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<items totalitems="1">
  <item objecttype="thing" objectid="39856" subtype="boardgame" collid="200">
    <name sortindex="1">Dixit</name>
    <yearpublished>2008</yearpublished>
    <status own="1" />
  </item>
</items>`;

export const COLLECTION_QUEUED_XML = `<?xml version="1.0" encoding="utf-8"?>
<message>Your request for this collection has been accepted and will be processed. Please try again later.</message>`;

export const ERROR_XML = `<?xml version="1.0" encoding="utf-8"?>
<errors>
  <error>
    <message>Invalid username specified</message>
  </error>
</errors>`;

export const TRUNCATED_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="13">
    <name type="primary" value="CATAN"`;

export const HTML_ERROR_PAGE = `<!DOCTYPE html><html><head><title>503</title></head><body>Service unavailable</body></html>`;
