// types
//      array
//      boolean
//      integer
//      number
//      null
//      object
//      string

function tsifyString(str) {
    return str
        .replace(/[^\w\d _]/g, '')
        .replace(/_/g, ' ')
        .replace(/ (\w)/g, s => s.trim().toUpperCase());
}

function convertObject(obj, property) {
    var title;
    if(property && obj.title) {
        property = tsifyString(property);
        title = tsifyString(obj.title);
    } else if(obj.title) {
        title = tsifyString(obj.title);
        property = title;
    } else if(property) {
        property = tsifyString(property);
        title = property;
    } else {
        throw new Error();
    }

    var type = obj.type;
    var description = obj.description;

    if(type === 'object') {
        var inner = '';
        var outer = '';

        for(prop in obj.properties) {
            var newObj = convertObject(obj.properties[prop], prop);
            inner += newObj[1];
            outer += newObj[2];
        }

        return [
                title,

                `${title}: ${property},` + "\n",

                `interface ${property} {` + "\n" +
                `${inner}` + "\n" +
                `}` + "\n" +
                `${outer}`,
            ];
    } else {
        return [
                title,
                `   ${property}: ${type},` + "\n",
                ""
            ];
    }
}

module.exports = function(json) {
    var output = convertObject(json);
    process.stdout.write(output[2]);
}
