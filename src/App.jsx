// duty-scheduler-app
// React + Tailwind + CSV download version with inline editable table for points

import React, { useState } from 'react';
import { format, parse } from 'date-fns';
import Papa from 'papaparse';

const MAX_DUTY_POINTS = 7;

const App = () => {
  const [csvData, setCsvData] = useState([]);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  const handlePointChange = (index, key, value) => {
    const updated = [...csvData];
    updated[index][key] = key === 'points' ? parseFloat(value || 0) : value;
    setCsvData(updated);
  };

  const parseBlockedDates = () => {
    const result = {};
    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    lines.forEach(line => {
      const [name, dates] = line.split(':').map(part => part.trim());
      if (!name || !dates) return;
      const ranges = dates.split(',').map(d => d.trim());
      const expanded = [];
      const baseMonth = monthYear.split('-')[1] - 1;
      const baseYear = +monthYear.split('-')[0];
      ranges.forEach(r => {
        const match = r.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/);
        if (match) {
          const startDay = parseInt(match[1]);
          const endDay = parseInt(match[2]);
          for (let d = startDay; d <= endDay; d++) {
            const date = new Date(baseYear, baseMonth, d);
            expanded.push(format(date, 'yyyy-MM-dd'));
          }
        } else if (/\d{1,2}/.test(r)) {
          const d = parseInt(r);
          const date = new Date(baseYear, baseMonth, d);
          expanded.push(format(date, 'yyyy-MM-dd'));
        }
      });
      result[name.toLowerCase()] = expanded;
    });
    setBlockedParsed(result);
    setConfirmed(true);
  };

  const isBlocked = (name, date) => {
    const blocked = blockedParsed?.[name.toLowerCase()] || [];
    return blocked.includes(date);
  };

  const assignDuty = (dateStr, type, assignedMap) => {
    const eligible = csvData.filter(p => {
      if (p.assigned >= MAX_DUTY_POINTS && (type === 'AM' || type === 'PM')) return false;
      if (isBlocked(p.name, dateStr)) return false;
      if (p.schedule.includes(dateStr)) return false;
      return true;
    });
    eligible.sort((a, b) => a.points + a.assigned - (b.points + b.assigned));
    const selected = eligible[0];
    if (!selected) return '';
    selected.assigned += (type === 'AM' || type === 'PM') ? 1 : 0;
    selected.schedule.push(dateStr);
    assignedMap[dateStr] = assignedMap[dateStr] || { AM: '', PM: '', AMR: [], PMR: [] };
    if (type === 'AM') assignedMap[dateStr].AM = selected.name;
    if (type === 'PM') assignedMap[dateStr].PM = selected.name;
    if (type === 'AMR') assignedMap[dateStr].AMR.push(selected.name);
    if (type === 'PMR') assignedMap[dateStr].PMR.push(selected.name);
    return selected.name;
  };

  const generateSchedule = () => {
    const [year, month] = monthYear.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();
    const assignments = {};
    for (let i = 1; i <= daysInMonth; i++) {
      const dateObj = new Date(year, month - 1, i);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      assignDuty(dateStr, 'AM', assignments);
      assignDuty(dateStr, 'PM', assignments);
      assignDuty(dateStr, 'AMR', assignments);
      assignDuty(dateStr, 'AMR', assignments);
      assignDuty(dateStr, 'PMR', assignments);
      assignDuty(dateStr, 'PMR', assignments);
    }

    const rows = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateObj = new Date(year, month - 1, i);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      const a = assignments[dateStr] || { AM: '', PM: '', AMR: [], PMR: [] };
      rows.push({
        Date: format(dateObj, 'd/M/yyyy'),
        Day: format(dateObj, 'EEE'),
        AM: a.AM,
        PM: a.PM,
        'AM Reserve 1': a.AMR[0] || '',
        'AM Reserve 2': a.AMR[1] || '',
        'PM Reserve 1': a.PMR[0] || '',
        'PM Reserve 2': a.PMR[1] || ''
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
    <div style={{ padding: '2em', maxWidth: '800px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '1.5em', fontWeight: 'bold', marginBottom: '1em' }}>Duty Scheduler</h1>

      <h2><strong>Enter Clerk Names and Current Points:</strong></h2>
      <table style={{ width: '100%', marginBottom: '1em', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Name</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Points</th>
          </tr>
        </thead>
        <tbody>
          {csvData.map((row, idx) => (
            <tr key={idx}>
              <td><input value={row.name} onChange={e => handlePointChange(idx, 'name', e.target.value)} style={{ width: '100%' }} /></td>
              <td><input value={row.points} type="number" onChange={e => handlePointChange(idx, 'points', e.target.value)} style={{ width: '100%' }} /></td>
            </tr>
          ))}
          <tr>
            <td><input placeholder="Name" onChange={e => handlePointChange(csvData.length, 'name', e.target.value)} /></td>
            <td><input placeholder="Points" type="number" onChange={e => handlePointChange(csvData.length, 'points', e.target.value)} /></td>
          </tr>
        </tbody>
      </table>

      <label><strong>Blocked-Out Dates (Optional):</strong></label>
      <textarea
        rows={6}
        value={blockedText}
        onChange={(e) => setBlockedText(e.target.value)}
        style={{ width: '100%', padding: '8px', marginBottom: '1em' }}
        placeholder={`Example:\nEmmanuel: 10–14\nDaniel: 17, 22–24`}
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
          <button onClick={generateSchedule} style={{ padding: '10px', backgroundColor: 'green', color: 'white', border: 'none', marginRight: '1em' }}>
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

