import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import Papa from 'papaparse';

const MAX_DUTY_POINTS = 7;

const App = () => {
  const [csvData, setCsvData] = useState([]);
  const [fetchedPoints, setFetchedPoints] = useState([]);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  // Auto-load clerk points from Google Sheet
  useEffect(() => {
    const fetchClerkPoints = async () => {
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
        }
      } catch (error) {
        alert("Failed to load clerk points from Google Sheet.");
        console.error(error);
      }
    };

    fetchClerkPoints();
  }, []);

  const parseBlockedDates = () => {
    const result = {};
    const lines = blockedText.split(/\n|\r/).filter(Boolean);
    const [year, month] = monthYear.split('-');

    lines.forEach(line => {
      const [name, dates] = line.split(':').map(part => part.trim());
      if (!name || !dates) return;
      const parts = dates.split(',').map(d => d.trim());
      const expanded = [];

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
      <h1>Duty Scheduler</h1>

      <label><b>Clerk Points (auto-loaded):</b></label>
      <textarea
        rows={6}
        value={fetchedPoints.map(p => `${p.name}: ${p.points}`).join('\n')}
        readOnly
        style={{ width: '100%', marginBottom: '1em', backgroundColor: '#f4f4f4', padding: '10px' }}
        placeholder="Loading clerk points..."
      />

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

      <button onClick={parseBlockedDates} style={{ padding: '10px', backgroundColor: 'orange', color: 'white', border: 'none', marginBottom: '1em' }}>
        Parse Blocked-Out Dates
      </button>

      {blockedParsed && (
        <div>
          <h3>Parsed Blocked-Out Dates:</h3>
          <ul>
            {Object.entries(blockedParsed).map(([name, dates]) => (
              <li key={name}><b>{name}</b>: {dates.map(d => format(new Date(d), 'd MMM')).join(', ')}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={generateSchedule}
        disabled={!csvData || !blockedParsed}
        style={{
          padding: '10px',
          backgroundColor: !csvData || !blockedParsed ? '#ccc' : 'green',
          color: 'white',
          border: 'none',
          marginTop: '1em'
        }}
      >
        Generate Schedule
      </button>
    </div>
  );
};

export default App;

