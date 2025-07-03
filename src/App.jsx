import React, { useState } from 'react';
import { format, parse } from 'date-fns';
import Papa from 'papaparse';

const App = () => {
  const [csvData, setCsvData] = useState(null);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  const handleCsvUpload = (e) => {
    Papa.parse(e.target.files[0], {
      header: true,
      complete: (results) => {
        setCsvData(results.data.filter(row => row.Name && row.Points));
      }
    });
  };

  const parseBlockedDates = () => {
    const result = {};
    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    lines.forEach(line => {
      const [name, dates] = line.split(':').map(part => part.trim());
      if (!name || !dates) return;
      const ranges = dates.split(',').map(d => d.trim());
      const expanded = [];

      ranges.forEach(r => {
        const [start, end] = r.split(/\s*[-–—]\s*/);
        const baseMonth = monthYear.split('-')[1] - 1;
        const baseYear = +monthYear.split('-')[0];
        const expandDate = (d) => parse(`${d} ${baseYear}`, 'd MMM yyyy', new Date());

        if (end) {
          const s = expandDate(start);
          const e = expandDate(end);
          let d = new Date(s);
          while (d <= e) {
            expanded.push(format(d, 'yyyy-MM-dd'));
            d.setDate(d.getDate() + 1);
          }
        } else {
          expanded.push(format(expandDate(start), 'yyyy-MM-dd'));
        }
      });
      result[name.toLowerCase()] = expanded;
    });
    setBlockedParsed(result);
    setConfirmed(true);
  };

  const generateCSV = () => {
    const rows = [];
    const [year, month] = monthYear.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const dateObj = new Date(year, month - 1, i);
      rows.push({
        Date: format(dateObj, 'd/M/yyyy'),
        Day: format(dateObj, 'EEE'),
        AM: '',
        PM: '',
        'AM Reserve 1': '',
        'AM Reserve 2': '',
        'PM Reserve 1': '',
        'PM Reserve 2': ''
      });
    }

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PlannedSchedule_${format(new Date(year, month - 1), 'MMM-yyyy')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '2em', maxWidth: '600px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '1.5em', fontWeight: 'bold', marginBottom: '1em' }}>Duty Scheduler</h1>

      <label><strong>Upload Current Points CSV:</strong></label>
      <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ marginBottom: '1em', display: 'block' }} />

      <label><strong>Blocked-Out Dates (Optional):</strong></label>
      <textarea
        rows={6}
        value={blockedText}
        onChange={(e) => setBlockedText(e.target.value)}
        style={{ width: '100%', padding: '8px', marginBottom: '1em' }}
        placeholder={`Example:\nEmmanuel: 10–14 Aug\nDaniel: 17, 22–24 Aug`}
      />

      <label><strong>Target Month:</strong></label>
      <input
        type="month"
        value={monthYear}
        onChange={(e) => setMonthYear(e.target.value)}
        style={{ marginBottom: '1em', display: 'block' }}
      />

      {!confirmed && (
        <button onClick={parseBlockedDates} style={{ padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none' }}>
          Confirm Blocked Dates
        </button>
      )}

      {confirmed && (
        <div style={{ marginTop: '2em' }}>
          <h2><strong>Parsed Blocked-Out Dates:</strong></h2>
          <ul>
            {Object.entries(blockedParsed || {}).map(([name, dates]) => (
              <li key={name}><strong>{name}</strong>: {dates.map(d => format(new Date(d), 'd MMM')).join(', ')}</li>
            ))}
          </ul>
          <br />
          <button onClick={generateCSV} style={{ padding: '10px', backgroundColor: 'green', color: 'white', border: 'none', marginRight: '1em' }}>
            Yes, Generate Schedule
          </button>
          <button onClick={() => setConfirmed(false)} style={{ padding: '10px', border: '1px solid #ccc' }}>
            Go Back to Edit
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
