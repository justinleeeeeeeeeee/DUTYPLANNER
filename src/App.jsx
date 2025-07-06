import React, { useState, useEffect } from 'react';
import { format, getDay, parseISO, getISOWeek, subDays, addDays } from 'date-fns';
import Papa from 'papaparse';

const MAX_LOWPOINT_CLERK = 8;
const MAX_HIGHPOINT_CLERK = 2;
const HIGH_POINT_THRESHOLD = 14;

const App = () => {
  const [csvData, setCsvData] = useState([]);
  const [fetchedPoints, setFetchedPoints] = useState([]);
  const [blockedText, setBlockedText] = useState('');
  const [blockedParsed, setBlockedParsed] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [monthYear, setMonthYear] = useState('2025-08');

  useEffect(() => {
    const fetchClerkPoints = async () => {
      try {
        const res = await fetch('https://script.google.com/macros/s/AKfycbxsJBDqmsxPSxAnaZHtE_n-ddHHRFjP9IKgtp-T1i-JhxvnlEcB00yQPa_oHihh6UbUrw/exec');
        const data = await res.json();
        if (Array.isArray(data)) {
          const parsed = data
            .filter(row => row.name && !isNaN(parseFloat(row.points)))
            .map(row => ({
              name: row.name.trim(),
              points: parseFloat(row.points),
              assigned: 0,
              assignedDates: [],
              dutyPointsThisMonth: 0,
              reserveByWeek: {},
              reserveDates: []
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
        const rangeMatch = part.match(/(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1]);
          const end = parseInt(rangeMatch[2]);
          for (let i = start; i <= end; i++) {
            expanded.push(format(new Date(+year, +month - 1, i), 'yyyy-MM-dd'));
          }
        } else if (/^\d{1,2}$/.test(part)) {
          expanded.push(format(new Date(+year, +month - 1, parseInt(part)), 'yyyy-MM-dd'));
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

  const calculateDutyPoints = (dateStr, type) => {
    const date = parseISO(dateStr);
    const day = getDay(date);
    if (type === 'AM' || type === 'PM') {
      if (day === 5 && type === 'PM') return 1.5; // Friday PM
      if (day === 0 || day === 6) return 2; // Weekend
      return 1; // Weekday
    }
    return 0; // Reserve
  };

  const hasBackToBack = (clerk, dateStr) => {
    const date = parseISO(dateStr);
    return clerk.assignedDates.some(d => {
      const diff = Math.abs((parseISO(d) - date) / (1000 * 60 * 60 * 24));
      return diff === 1;
    });
  };

  const assignDuty = (dateStr, type, assignedMap) => {
    const weekNum = getISOWeek(parseISO(dateStr));
    let reserveLimit = 2;

    const getEligible = (limit) => csvData.filter(p => {
      const isHigh = p.points >= HIGH_POINT_THRESHOLD;
      const maxCap = isHigh ? MAX_HIGHPOINT_CLERK : MAX_LOWPOINT_CLERK;
      const dutyPointValue = calculateDutyPoints(dateStr, type);

      if (isBlocked(p.name, dateStr)) return false;
      if (p.assignedDates.includes(dateStr)) return false;
      if (hasBackToBack(p, dateStr)) return false;
      if (p.dutyPointsThisMonth + dutyPointValue > maxCap && (type === 'AM' || type === 'PM')) return false;

      if (type === 'AMR' || type === 'PMR') {
        const reserveCount = p.reserveByWeek[weekNum] || 0;
        if (reserveCount >= limit) return false;
        const date = parseISO(dateStr);
        const before = format(subDays(date, 1), 'yyyy-MM-dd');
        const after = format(addDays(date, 1), 'yyyy-MM-dd');
        if (p.assignedDates.includes(before) || p.assignedDates.includes(after)) return false;
      }

      return true;
    });

    let eligible = getEligible(reserveLimit);
    while ((type === 'AMR' || type === 'PMR') && eligible.length < 2 && reserveLimit < 7) {
      reserveLimit++;
      eligible = getEligible(reserveLimit);
    }

    eligible.sort((a, b) => (a.points + a.dutyPointsThisMonth) - (b.points + b.dutyPointsThisMonth));

    const selected = eligible[0];
    if (!selected) return '';

    const dutyPointValue = calculateDutyPoints(dateStr, type);
    selected.assignedDates.push(dateStr);
    selected.dutyPointsThisMonth += dutyPointValue;
    selected.assigned += type === 'AM' || type === 'PM' ? 1 : 0;

    if (type === 'AMR' || type === 'PMR') {
      selected.reserveByWeek[weekNum] = (selected.reserveByWeek[weekNum] || 0) + 1;
      selected.reserveDates.push(dateStr);
    }

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

