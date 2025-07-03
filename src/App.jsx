// App.jsx – Copy-paste version (no file upload)

import React, { useState } from 'react';
import { format, parse } from 'date-fns';
import Papa from 'papaparse';

const MAX_DUTY_POINTS = 7;

const App = () => {
  const [rawPoints, setRawPoints] = useState('');
  const [csvData, setCsvData] = useState(null);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  const parsePoints = () => {
    const lines = rawPoints.trim().split('\n').filter(Boolean);
    const parsed = lines.slice(1).map(line => {
      const [name, points] = line.split(',').map(s => s.trim());
      return {
        name,
        points: parseFloat(points),
        assigned: 0,
        schedule: []
      };
    });
    setCsvData(parsed);
  };

  const parseBlockedDates = () => {
    const result = {};
    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    lines.forEach(line => {
      const match = line.match(/^([\w\s]+)[^\d]*(\d{1,2}(?:\/\d{1,2}\/\d{2,4}|[–-]\d{1,2})?(?:[,–\-\s\d\/]*)?)/i);
      if (!match) return;
      const name = match[1].trim().toLowerCase();
      const datePart = match[2];
      const baseMonth = parseInt(monthYear.split('-')[1], 10) - 1;
      const baseYear = +monthYear.split('-')[0];
      const expanded = [];

      const parts = datePart.split(/,|\s+/).map(s => s.trim()).filter(Boolean);
      parts.forEach((part, idx) => {
        if (part.includes('-') || part.includes('–')) {
          const [s, e] = part.split(/–|-/).map(x => x.trim());
          const start = parse(`${s} ${baseYear}`, 'd MMM yyyy', new Date(baseYear, baseMonth));
          const end = parse(`${e} ${baseYear}`, 'd MMM yyyy', new Date(baseYear, baseMonth));
          let d = new Date(start);
          while (d <= end) {
            expanded.push(format(d, 'yyyy-MM-dd'));
            d.setDate(d.getDate() + 1);
          }
        } else if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(part)) {
          const parsedDate = parse(part, 'd/M/yy', new Date());
          expanded.push(format(parsedDate, 'yyyy-MM-dd'));
        } else if (/\d{1,2}/.test(part)) {
          const parsedDate = new Date(baseYear, baseMonth, +part);
          expanded.push(format(parsedDate, 'yyyy-MM-dd'));
        }
      });
      result[name] = (result[name] || []).concat(expanded);
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
    <div style={{ padding: '2em', maxWidth: '600px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '1.5em', fontWeight: 'bold', marginBottom: '1em' }}>Duty Scheduler</h1>

      <label><strong>Paste Current Points:</strong></label>
      <textarea
        rows={10}
        value={rawPoints}
        onChange={(e) => setRawPoints(e.target.value)}
        style={{ width: '100%', padding: '8px', marginBottom: '1em' }}
        placeholder={`Name,Points\nAsher,1\nBenjamin,7.5\n...`}
      />

      <button onClick={parsePoints} style={{ marginBottom: '2em', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none' }}>
        Confirm Points
      </button>

      {csvData && (
        <>
          <label><strong>Blocked-Out Dates (Optional):</strong></label>
          <textarea
            rows={6}
            value={blockedText}
            onChange={(e) => setBlockedText(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '1em' }}
            placeholder={`e.g.\nDong Han: 3, 6, 20–22 Aug\nHarshith: 4–9 Aug\nDervin: 02/08/25–10/08/25`}
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
        </>
      )}
    </div>
  );
};

export default App;
