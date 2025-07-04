// src/App.jsx
import React, { useState } from 'react';
import { format, parse } from 'date-fns';
import Papa from 'papaparse';

const MAX_DUTY_POINTS = 7;

const App = () => {
  const [rawInput, setRawInput] = useState('');
  const [csvData, setCsvData] = useState([]);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  const parsePointsText = () => {
    const lines = rawInput.trim().split('\n');
    const result = [];
    lines.forEach(line => {
      const [name, point] = line.split(',');
      if (name && !isNaN(parseFloat(point))) {
        result.push({
          name: name.trim().toLowerCase(),
          points: parseFloat(point),
          assigned: 0,
          schedule: []
        });
      }
    });
    setCsvData(result);
  };

  const parseBlockedDates = () => {
    const result = {};
    const baseYear = +monthYear.split('-')[0];
    const baseMonth = +monthYear.split('-')[1];

    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    lines.forEach(line => {
      const [nameRaw, datesRaw] = line.split(':');
      if (!nameRaw || !datesRaw) return;
      const name = nameRaw.trim().toLowerCase();
      const blocked = new Set();

      const ranges = datesRaw.split(',').map(d => d.trim());
      ranges.forEach(entry => {
        const cleaned = entry.replace(/[–—]/g, '-');
        const rangeMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})(?:\s+(\w+))?$/);
        if (rangeMatch) {
          const [_, start, end, monthText] = rangeMatch;
          const month = monthText ? parse(`${monthText.slice(0, 3)} ${baseYear}`, 'MMM yyyy', new Date()).getMonth() + 1 : baseMonth;
          for (let d = +start; d <= +end; d++) {
            const date = new Date(baseYear, month - 1, d);
            blocked.add(format(date, 'yyyy-MM-dd'));
          }
        } else {
          const singleMatch = cleaned.match(/^(\d{1,2})(?:\s+(\w+))?$/);
          if (singleMatch) {
            const [_, day, monthText] = singleMatch;
            const month = monthText ? parse(`${monthText.slice(0, 3)} ${baseYear}`, 'MMM yyyy', new Date()).getMonth() + 1 : baseMonth;
            const date = new Date(baseYear, month - 1, +day);
            blocked.add(format(date, 'yyyy-MM-dd'));
          }
        }
      });

      result[name] = Array.from(blocked).sort();
    });

    setBlockedParsed(result);
    setConfirmed(true);
  };

  const isBlocked = (name, date) => {
    return blockedParsed?.[name.toLowerCase()]?.includes(date) || false;
  };

  const assignDuty = (dateStr, type, assignments) => {
    const eligible = csvData.filter(p => {
      if (p.assigned >= MAX_DUTY_POINTS && (type === 'AM' || type === 'PM')) return false;
      if (isBlocked(p.name, dateStr)) return false;
      if (p.schedule.includes(dateStr)) return false;
      return true;
    });
    eligible.sort((a, b) => a.points + a.assigned - (b.points + b.assigned));
    const selected = eligible[0];
    if (!selected) return '';
    if (type === 'AM' || type === 'PM') selected.assigned += 1;
    selected.schedule.push(dateStr);
    assignments[dateStr] = assignments[dateStr] || { AM: '', PM: '', AMR: [], PMR: [] };
    if (type === 'AM') assignments[dateStr].AM = selected.name;
    if (type === 'PM') assignments[dateStr].PM = selected.name;
    if (type === 'AMR') assignments[dateStr].AMR.push(selected.name);
    if (type === 'PMR') assignments[dateStr].PMR.push(selected.name);
    return selected.name;
  };

  const generateSchedule = () => {
    const [year, month] = monthYear.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    const assignments = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      assignDuty(dateStr, 'AM', assignments);
      assignDuty(dateStr, 'PM', assignments);
      assignDuty(dateStr, 'AMR', assignments);
      assignDuty(dateStr, 'AMR', assignments);
      assignDuty(dateStr, 'PMR', assignments);
      assignDuty(dateStr, 'PMR', assignments);
    }

    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      const dayRow = assignments[dateStr] || { AM: '', PM: '', AMR: [], PMR: [] };
      rows.push({
        Date: format(dateObj, 'd/M/yyyy'),
        Day: format(dateObj, 'EEE'),
        AM: dayRow.AM,
        PM: dayRow.PM,
        'AM Reserve 1': dayRow.AMR[0] || '',
        'AM Reserve 2': dayRow.AMR[1] || '',
        'PM Reserve 1': dayRow.PMR[0] || '',
        'PM Reserve 2': dayRow.PMR[1] || ''
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
    <div style={{ padding: '2em', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '1.8em', fontWeight: 'bold', marginBottom: '1em' }}>Duty Scheduler</h1>

      <label><strong>Paste Current Points (Name,Points):</strong></label>
      <textarea
        rows={10}
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
        style={{ width: '100%', padding: '10px', marginBottom: '1em', fontFamily: 'monospace' }}
        placeholder={`asher,1\nBenjamin,7.5\n...`}
      />
      <button onClick={parsePointsText} style={{ marginBottom: '1.5em', padding: '10px', backgroundColor: '#444', color: 'white' }}>
        Parse Points
      </button>

      <label><strong>Blocked-Out Dates (Optional):</strong></label>
      <textarea
        rows={5}
        value={blockedText}
        onChange={(e) => setBlockedText(e.target.value)}
        style={{ width: '100%', padding: '10px', marginBottom: '1em' }}
        placeholder={`dong han: 3, 6, 20–22 Aug\nharshith: 4–9\ndervin: 2–10`}
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
          <h2><strong>Parsed Blocked Dates:</strong></h2>
          <ul>
            {Object.entries(blockedParsed || {}).map(([name, dates]) => (
              <li key={name}><strong>{name}</strong>: {dates.map(d => format(new Date(d), 'd MMM')).join(', ')}</li>
            ))}
          </ul>
          <br />
          <button onClick={generateSchedule} style={{ padding: '10px', backgroundColor: 'green', color: 'white', border: 'none', marginRight: '1em' }}>
            Generate Schedule
          </button>
          <button onClick={() => setConfirmed(false)} style={{ padding: '10px', border: '1px solid #ccc' }}>
            Edit Again
          </button>
        </div>
      )}
    </div>
  );
};

export default App;

