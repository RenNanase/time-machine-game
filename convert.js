const fs = require('fs');
const csv = require('csv-parser');

const results = [];

console.log('Starting conversion from CSV to JSON...');

fs.createReadStream('events.csv')
  .pipe(csv({
    mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').trim()
  }))
  .on('data', (data) => {
    // Convert year from string to number
    if (data.year) {
      data.year = parseInt(data.year, 10);
    }
    results.push(data);
  })
  .on('end', () => {
    fs.writeFile('events.json', JSON.stringify(results, null, 4), (err) => {
      if (err) {
        console.error('Error writing JSON file:', err);
        return;
      }
      console.log('Successfully converted events.csv to events.json!');
      console.log(`Processed ${results.length} events.`);
    });
  });
