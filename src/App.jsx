// duty-scheduler-app
// React + Tailwind + CSV download version with auto assignment logic and Google Sheet fetch

import React, { useState } from 'react';
import { format, parse } from 'date-fns';
import Papa from 'papaparse';

const MAX_DUTY_POINTS = 7;

const App = () => {
  const [csvData, setCsvData] = useState(null);
  const [fetchedPoints, setFetchedPoints] = useState([]);
  const [pointsConfirmed, setPointsConfirmed] = useState(false);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  const handleCsvUpload = (e) => {
    Papa.parse(e.target.files[0], {
      header: true,
      complete: (results) => {
        const parsed = results.data.filter(row => row.Name && !isNaN(parseFloat(row.Points)));
        setCsvData(parsed.map(row => ({
          name: row.Name.trim(),
          points: parseFloat(row.Points),
          assigned: 0,
          schedule: []
        })));
        setPointsConfirmed(true);
      }
    });
  };

  const handleRecallPoints = async () => {
    try {
      const res = await fetch('https://script.google.com/macros/s/AKfycbxsJBDqmsxPSxAnaZHtE_n-ddHHRFjP9IKgtp-T1i-JhxvnlEcB00yQPa_oHihh6UbUrw/exec');
      const data = await res.json();
      if (Array.isArray(data)) {
        const parsed = data
          .filter(row => row.Name && !isNaN(parseFloat(row.Points)))
          .map(row => ({
            name: row.Name.trim(),
            points: parseFloat(row.Points),
            assigned: 0,
            schedule: []
          }));
        setFetchedPoints(parsed);
        setCsvData(parsed);
        setPointsConfirmed(false);
      }
    } catch (error) {
      alert("Failed to load data. Check internet or script access.");
      console.error(error);
    }
  };

  const parseBlockedDates = () => {
    const result = {};
    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    lines.forEach(line => {
      const [name, dates] = line.split(':').map(part => part.trim());
      if (!name || !dates) return;
      const parts = dates.split(',').map(d => d.trim());
      const expanded = [];
      const [year, month] = monthYear.split('-');
      parts.forEach(part => {
        const rangeMatch = part.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1]);
          const end = parseInt(rangeMatch[2]);
          for (let i = start; i <= end; i++) {
            const d = new Date(+year, +month - 1, i);
            expanded.push(format(d, 'yyyy-MM-dd'));
          }
        } else if (/^\d{1,2}$/.test(part)) {
          const d = new Date(+year, +month - 1, parseInt(part));
          expanded.push(format(d, 'yyyy-MM-dd'));
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
    <div style={{ padding: '2em', maxWidth: '700px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '1.5em', fontWeight: 'bold', marginBottom: '1em' }}>Duty Scheduler</h1>

      <button onClick={handleRecallPoints} style={{ padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', marginRight: '1em' }}>
        Recall Current Duty Clerk Points
      </button>

      {fetchedPoints.length > 0 && !pointsConfirmed && (
        <div style={{ marginBottom: '1em' }}>
          <h3>Fetched Clerk Points:</h3>
          <table border="1" cellPadding="5">
            <thead>
              <tr><th>Name</th><th>Points</th></tr>
            </thead>
            <tbody>
              {fetchedPoints.map((p, i) => (
                <tr key={i}><td>{p.name}</td><td>{p.points}</td></tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setPointsConfirmed(true)} style={{ marginTop: '10px', padding: '8px', background: 'green', color: 'white' }}>
            Yes, Use These Points
          </button>
        </div>
      )}

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

      {!confirmed && pointsConfirmed && (
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
