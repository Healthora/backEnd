const currentDay = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
console.log('Current Day:', currentDay);
