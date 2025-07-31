document.addEventListener('DOMContentLoaded', function() {
    const jsonUrl = 'data/genary.json';
    const emergencyApiBase = 'data/emergency';
    let updateTime;
    const dataCache = {};
    let dataOptions = [];
    let emergencyTimelineChart = null;
    let currentEmergencyData = null;
    let emergencyDatesCache = new Set();
    let emergencyMonthsData = null;
    let loadedMonths = new Set();

    fetch(jsonUrl)
        .then(response => response.json())
        .then(data => {
            updateTime = data[''];
            updatePage(data);
            fetchAndPopulateSlider();
            loadEmergencyDates();
            initializeDatePicker();
            checkEmergencyGenerators();
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            document.body.innerHTML = '<h1>Error loading data. Please try again later.</h1>';
        });

    let autoUpdateInterval = null;
    const autoUpdateDelay = 1000;

    function fetchAndPopulateSlider() {
        const [date, time] = updateTime.split(' ');
        const [year, month, day] = date.split('-');
        const Y = year;
        const Ymd = year + month + day;

        fetch(`data/genary/${Y}/${Ymd}/list.json`)
            .then(response => response.json())
            .then(data => {
                dataOptions = data.sort((a, b) => a.localeCompare(b));
                const slider = document.getElementById('timeSlider');
                const autoUpdateButton = document.getElementById('autoUpdateButton');
                slider.max = dataOptions.length - 1;
                slider.value = slider.max;
                updateSliderValue(slider.max);
                updateSliderLabels();
                slider.addEventListener('input', function() {
                    updateSliderValue(this.value);
                });
                slider.addEventListener('change', function() {
                    loadDataForIndex(this.value);
                    checkEmergencyGenerators();
                });
                autoUpdateButton.addEventListener('click', toggleAutoUpdate);
                loadDataForIndex(slider.max);
            })
            .catch(error => console.error('Error fetching list.json:', error));
    }

    function toggleAutoUpdate() {
        const button = document.getElementById('autoUpdateButton');
        if (autoUpdateInterval) {
            clearInterval(autoUpdateInterval);
            autoUpdateInterval = null;
            button.textContent = '自動更新';
            button.classList.remove('btn-danger');
            button.classList.add('btn-primary');
        } else {
            totalPowerData.length = 0;
            nuclearData.length = 0;
            coalData.length = 0;
            gasData.length = 0;
            otherThermalData.length = 0;
            renewableData.length = 0;
            totalPowerTimes.length = 0;
            autoUpdateInterval = setInterval(autoUpdate, autoUpdateDelay);
            button.textContent = '暫停';
            button.classList.remove('btn-primary');
            button.classList.add('btn-danger');
        }
    }

    function autoUpdate() {
        const slider = document.getElementById('timeSlider');
        let nextValue = parseInt(slider.value) + 3;
        if (nextValue > slider.max) {
            nextValue = 0;
            totalPowerData.length = 0;
            nuclearData.length = 0;
            coalData.length = 0;
            gasData.length = 0;
            otherThermalData.length = 0;
            renewableData.length = 0;
            totalPowerTimes.length = 0;
        }
        slider.value = nextValue;
        updateSliderValue(nextValue);
        loadDataForIndex(nextValue, true);
        checkEmergencyGenerators();
    }

    function updateSliderLabels() {
        const startLabel = document.getElementById('sliderStart');
        const endLabel = document.getElementById('sliderEnd');

        if (dataOptions.length > 0) {
            const startTime = formatTime(dataOptions[0]);
            const endTime = formatTime(dataOptions[dataOptions.length - 1]);

            startLabel.textContent = startTime;
            endLabel.textContent = endTime;
        }
    }

    function formatTime(filename) {
        const [hour, minute] = filename.split('.')[0].match(/\d{2}/g);
        return `${hour}:${minute}`;
    }

    function updateSliderValue(index) {
        const sliderValue = document.getElementById('sliderValue');
        const formattedTime = formatTime(dataOptions[index]);
        sliderValue.textContent = `${updateTime.split(' ')[0]} ${formattedTime}`;
    }

    function loadDataForIndex(index, isAutoUpdate = false) {
        const selectedHis = dataOptions[index];
        const [date] = updateTime.split(' ');
        const [year, month, day] = date.split('-');
        const Y = year;
        const Ymd = year + month + day;
        const newDataSource = `data/genary/${Y}/${Ymd}/${selectedHis}.json`;

        if (dataCache[selectedHis]) {
            updatePage(dataCache[selectedHis], isAutoUpdate);
        } else {
            fetch(newDataSource)
                .then(response => response.json())
                .then(data => {
                    dataCache[selectedHis] = data;
                    updatePage(data, isAutoUpdate);
                })
                .catch(error => console.error('Error fetching new data:', error));
        }
    }

    function updatePage(data, isAutoUpdate = false) {
        const updateTime = data[''] || data['updateTime'];
        document.getElementById('updateTime').textContent = `更新時間 - ${updateTime}`;
        let aaData;
        if (Array.isArray(data)) {
            aaData = data;
        } else if (data.aaData) {
            aaData = data.aaData;
        } else {
            console.error('Unexpected data structure:', data);
            return;
        }

        const powerSources = processPowerSources(aaData);
        displayPowerSources(powerSources);
        const totalPower = calculateTotalPower(powerSources);
        const groupedData = groupPowerSources(powerSources);

        if (isAutoUpdate) {
            const slider = document.getElementById('timeSlider');
            totalPowerData.push(totalPower);
            nuclearData.push(groupedData['核能']);
            coalData.push(groupedData['燃煤'] || 0);
            gasData.push(groupedData['燃氣'] || 0);
            otherThermalData.push(groupedData['其他火力'] || 0);
            renewableData.push(groupedData['再生能源']);
            totalPowerTimes.push(formatTime(dataOptions[slider.value]));

            if (totalPowerData.length > maxDataPoints) {
                totalPowerData.shift();
                nuclearData.shift();
                coalData.shift();
                gasData.shift();
                otherThermalData.shift();
                renewableData.shift();
                totalPowerTimes.shift();
            }
            updateTotalPowerChart();
        }
        document.getElementById('totalPower').textContent = `總計： ${totalPower.toFixed(1)} MW`;
        displayTableData(aaData);
        displayNotes();
    }

    function processPowerSources(aaData) {
        const powerSources = {};
        aaData.forEach(row => {
            const fuelType = row[0];
            const name = row[2];
            if (name.includes('小計')) return;

            const capacity = row[3] === 'N/A' ? 0 : parseFloat(row[3].split('(')[0]) || 0;
            const output = row[4] === 'N/A' ? 0 : parseFloat(row[4].split('(')[0]) || 0;

            if (!powerSources[fuelType]) {
                powerSources[fuelType] = {
                    capacity: 0,
                    output: 0
                };
            }

            if (capacity > 0) powerSources[fuelType].capacity += capacity;
            if (output > 0) powerSources[fuelType].output += output;
        });
        return powerSources;
    }

    function groupPowerSources(powerSources) {
        const groups = {
            '核能': 0,
            '燃煤': 0,
            '燃氣': 0,
            '其他火力': 0,
            '再生能源': 0
        };

        for (const [name, data] of Object.entries(powerSources)) {
            if (name.includes('核能')) {
                groups['核能'] += data.output;
            } else if (['燃煤', '汽電共生', '民營電廠-燃煤'].some(fuel => name.includes(fuel))) {
                groups['燃煤'] += data.output;
            } else if (['燃氣', '民營電廠-燃氣'].some(fuel => name.includes(fuel))) {
                groups['燃氣'] += data.output;
            } else if (['燃油', '輕油'].some(fuel => name.includes(fuel))) {
                groups['其他火力'] += data.output;
            } else {
                groups['再生能源'] += data.output;
            }
        }

        return groups;
    }

    let barChart = null;
    let pieChart = null;
    let totalPowerChart = null;
    const totalPowerData = [];
    const maxDataPoints = 144;
    const totalPowerTimes = [];
    const nuclearData = [];
    const coalData = [];
    const gasData = [];
    const otherThermalData = [];
    const renewableData = [];

    function displayPowerSources(powerSources) {
        const powerSourcesContainer = document.getElementById('powerSources');

        const labels = [];
        const data = [];
        const backgroundColors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
        ];

        let chartsContainer = document.getElementById('chartsContainer');
        if (!chartsContainer) {
            chartsContainer = document.createElement('div');
            chartsContainer.id = 'chartsContainer';
            chartsContainer.className = 'row mb-4';
            chartsContainer.innerHTML = `
                <div class="col-md-6 mb-4">
                    <div class="card shadow-sm h-100">
                        <div class="card-body">
                            <canvas id="powerSourcesBarChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-4">
                    <div class="card shadow-sm h-100">
                        <div class="card-body">
                            <canvas id="powerSourcesPieChart"></canvas>
                        </div>
                    </div>
                </div>
            `;
            powerSourcesContainer.appendChild(chartsContainer);
        }

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'row row-cols-2 row-cols-md-3 row-cols-lg-4 g-2 mb-4';

        const stripHtml = (html) => {
            let tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
        };

        Object.entries(powerSources).forEach(([name, sourceData], index) => {
            const col = document.createElement('div');
            col.className = 'col';
            const card = document.createElement('div');
            card.className = 'card h-100 shadow-sm';
            card.style.borderLeft = `4px solid ${backgroundColors[index % backgroundColors.length]}`;

            const cleanName = stripHtml(name);
            card.innerHTML = `
                <div class="card-body p-2">
                    <h6 class="card-title mb-1">${cleanName}</h6>
                    <p class="card-text mb-0">
                        <strong>${sourceData.output.toFixed(1)}</strong> MW
                        <br>
                        <small class="text-muted">容量：${sourceData.capacity.toFixed(1)} MW</small>
                    </p>
                </div>
            `;
            col.appendChild(card);
            cardsContainer.appendChild(col);
            labels.push(cleanName);
            data.push(sourceData.output);
        });
        powerSourcesContainer.innerHTML = '';
        powerSourcesContainer.appendChild(chartsContainer);
        powerSourcesContainer.appendChild(cardsContainer);
        const groupedData = groupPowerSources(powerSources);
        updateBarChart(groupedData, backgroundColors);
        updatePieChart(groupedData, backgroundColors);
    }

    function updateBarChart(groupedData, backgroundColors) {
        const ctx = document.getElementById('powerSourcesBarChart').getContext('2d');

        const labels = Object.keys(groupedData);
        const data = Object.values(groupedData);
        const colors = labels.map(label => colorMapping[label]);

        if (barChart) {
            barChart.data.labels = labels;
            barChart.data.datasets[0].data = data;
            barChart.data.datasets[0].backgroundColor = colors;
            barChart.update();
        } else {
            barChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '發電量（MW）',
                        data: data,
                        backgroundColor: colors,
                        borderColor: colors,
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 500
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: '發電量（MW）'
                            }
                        },
                        y: {
                            title: {
                                display: false
                            },
                            ticks: {
                                crossAlign: 'left',
                                autoSkip: false
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: '各能源別即時發電量'
                        }
                    },
                    layout: {
                        padding: {
                            left: 0,
                            right: 0
                        }
                    }
                }
            });
        }
    }

    function updatePieChart(groupedData, backgroundColors) {
        const ctx = document.getElementById('powerSourcesPieChart').getContext('2d');
        const totalOutput = Object.values(groupedData).reduce((sum, value) => sum + value, 0);

        const labels = Object.keys(groupedData);
        const data = Object.values(groupedData);
        const colors = labels.map(label => colorMapping[label]);

        if (pieChart) {
            pieChart.data.labels = labels;
            pieChart.data.datasets[0].data = data;
            pieChart.data.datasets[0].backgroundColor = colors;
            pieChart.data.datasets[0].borderColor = colors;
            pieChart.update();
        } else {
            pieChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: colors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 500
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                        title: {
                            display: true,
                            text: '發電源分布'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const percentage = ((value / totalOutput) * 100).toFixed(1);
                                    return `${label}: ${value.toFixed(1)} MW (${percentage}%)`;
                                }
                            }
                        },
                        datalabels: {
                            color: '#fff',
                            font: {
                                weight: 'bold',
                                size: 14
                            },
                            formatter: (value, ctx) => {
                                const dataset = ctx.chart.data.datasets[0];
                                const total = dataset.data.reduce((acc, data) => acc + data, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${percentage}%`;
                            }
                        }
                    }
                },
                plugins: [ChartDataLabels]
            });
        }
    }

    function calculateTotalPower(powerSources) {
        return Object.values(powerSources).reduce((total, source) => total + Math.max(0, source.output), 0);
    }

    function displayTableData(aaData) {
        const tableBody = document.querySelector('#powerTable tbody');
        tableBody.innerHTML = '';
        aaData.forEach(row => {
            const tr = document.createElement('tr');
            const isSubtotal = row[2].includes('小計');

            if (isSubtotal) {
                tr.classList.add('subtotal-row');
            }

            tr.innerHTML = `
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
                <td>${row[3]}</td>
                <td>${row[4]}</td>
                <td>${row[5]}</td>
                <td>${row[6]}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    function displayNotes() {
        const notes = [
            '裝置容量：通常以構成該機組之原動機或發電機之設計容量（名牌所列發定額容量）稱之（取用二者中較小者），如以系統而論，則為該系統所有發電廠裝置容量之和。唯，民營電廠依購售電合約，裝置容量以各機組之簽約容量計。',
            '淨發電量：發電廠發電機所產生之電能，電力系統上屬於公司發電廠之輸出電能。（廠毛發電量 - 廠內用電）',
            '淨發電量高於裝置容量之說明：（1）因核能機組完成提升出力改善計畫，致實際發電能力超出原規劃裝置容量。（2）部分火力機組因機組配件升級、環境溫度較低、機組效能測試等因素之影響，致使淨發電量可能高於裝置容量，惟大多屬短暫性現象，亦不影響台灣電力公司與民營電廠之全年合約購電量。（3）本公司所購入汽電共生係為餘電收購，有淨發電量貢獻，其中垃圾及沼氣計入裝置容量，其餘不計入本公司系統裝置容量。',
            '澎湖尖山：僅含澎湖本島尖山電廠。金門塔山：含大、小金門所有電廠。馬祖珠山：只含南竿、北竿及珠山等電廠。離島其他：含蘭嶼、綠島、小琉球、連江縣[馬祖]離島（東引、東莒、西莒）及澎湖縣離島（七美、望安、虎井，但不含吉貝、鳥嶼）等電廠。※顯示之發電量為毛發電量。',
            '核能電廠全黑起動氣渦輪機，其淨尖峰能力 15.5 萬瓩，但其裝置容量不計入台灣電力公司系統裝置容量，發電量計入燃油(輕油)發電。',
            '北部小水力: 圓山、天埤、軟橋、石圳聯通管。 中部小水力: 后里、社寮、景山、北山、濁水、湖山、南岸二。 南部小水力: 六龜、竹門。 東部小水力: 銅門、龍溪、水簾、清水、清流、初英、榕樹、溪口、東興。',
            '太陽能購電：所顯示之發電量係參考購電取樣發電量分區比例估算得出。購售電件數請參考本公司首頁：資訊揭露->發電資訊->購入電力概況->購入電力分布情形。',
            '淨發電量若標示為 N/A，表示無即時資訊。',
            '本網頁資料為每 10 分鐘更新，請重新整理頁面，可顯示最新資訊。',
            '電廠（機組）換發/取得電業執照前進行測試(試運轉)等程序時，該電廠（機組）暫不計入裝置容量且不揭露其發電百分比。',
            '備註欄補充說明：點擊見詳細說明',
            '依高雄市環保局 108.09.20 核發之操作許可證，興達電廠 2 部燃煤機組於秋冬空品不良季節（10 月至翌年 3 月）停機，另 2 部機組平均生煤用量削減至 65%；如因用電需求指令機組升載超過 65% 時，將另於適當時機調度降載，以維持 2 部機平均負載 65% 為原則，並定期追蹤管控，以符合生煤減量之環保責任。',
            '裝置容量 20 MW 以上且併接電壓等級 69 仟伏以上之機組單獨呈現，其餘則整併一筆資料。',
            '大林 #5 機 111 年 12 月 31 日除役並轉為緊急備用電力設施。',
            '興達 #1 機 112 年 9 月 30 日除役並轉為緊急備用電力設施;興達 #2 機 112 年 12 月 31 日除役並轉為緊急備用電力設施。',
            '興達 #3、#4 機自 113 年起第一、四季不運轉，114 年起轉為備用機組，僅於第二、三季當預估供電餘裕（率）低於 8% 時啟用。',
            '電池係指「能量型電池儲能」，且裝置容量係指電力交易平台「電能移轉複合動態調節備轉」該小時得標容量。'
        ];

        const notesContainer = document.getElementById('notes');
        notesContainer.innerHTML = '';
        notes.forEach((note, index) => {
            const p = document.createElement('p');
            p.className = 'note';
            p.textContent = `註 ${index + 1}： ${note}`;
            notesContainer.appendChild(p);
        });
    }

    function updateTotalPowerChart() {
        const ctx = document.getElementById('totalPowerChart').getContext('2d');

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '時間'
                    }
                },
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: '發電量（MW）'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '總發電量變化'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                },
                legend: {
                    position: 'top',
                }
            },
            animation: {
                duration: 0
            }
        };

        const datasets = [{
                label: '總發電量（MW）',
                data: totalPowerData,
                borderColor: colorMapping['總發電量'],
                tension: 0.1,
                fill: false
            },
            {
                label: '核能（MW）',
                data: nuclearData,
                borderColor: colorMapping['核能'],
                tension: 0.1,
                fill: false
            },
            {
                label: '燃煤（MW）',
                data: coalData,
                borderColor: colorMapping['燃煤'],
                tension: 0.1,
                fill: false
            },
            {
                label: '燃氣（MW）',
                data: gasData,
                borderColor: colorMapping['燃氣'],
                tension: 0.1,
                fill: false
            },
            {
                label: '其他火力（MW）',
                data: otherThermalData,
                borderColor: colorMapping['其他火力'],
                tension: 0.1,
                fill: false
            },
            {
                label: '再生能源（MW）',
                data: renewableData,
                borderColor: colorMapping['再生能源'],
                tension: 0.1,
                fill: false
            }
        ];

        if (totalPowerChart) {
            totalPowerChart.data.labels = totalPowerTimes;
            totalPowerChart.data.datasets = datasets;
            totalPowerChart.update();
        } else {
            totalPowerChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: totalPowerTimes,
                    datasets: datasets
                },
                options: chartOptions
            });
        }
    }

    const colorMapping = {
        '核能': 'rgb(255, 99, 132)',
        '燃煤': 'rgb(139, 69, 19)',
        '燃氣': 'rgb(255, 165, 0)',
        '其他火力': 'rgb(255, 205, 86)',
        '再生能源': 'rgb(54, 162, 235)',
        '總發電量': 'rgb(75, 192, 192)',
        '火力發電': 'rgb(255, 205, 86)'
    };
    let currentCalendarDate = new Date();
    let selectedDate = null;
    let calendarVisible = false;

    function initializeDatePicker() {
        const [currentDate] = updateTime.split(' ');
        selectedDate = currentDate;
        currentCalendarDate = new Date(currentDate);
        initializeCustomCalendar();
        updateDateDisplay();
        if (emergencyDatesCache.has(currentDate)) {
            document.getElementById('datePickerDisplay').classList.add('has-emergency');
        }
    }

    function initializeCustomCalendar() {
        const dateDisplay = document.getElementById('datePickerDisplay');
        const calendar = document.getElementById('customCalendar');
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        dateDisplay.addEventListener('click', () => {
            calendarVisible = !calendarVisible;
            calendar.style.display = calendarVisible ? 'block' : 'none';
            if (calendarVisible) {
                renderCalendar();
            }
        });
        prevBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            ensureEmergencyDataForMonth(currentCalendarDate);
            renderCalendar();
        });

        nextBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            ensureEmergencyDataForMonth(currentCalendarDate);
            renderCalendar();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-date-picker')) {
                calendar.style.display = 'none';
                calendarVisible = false;
            }
        });
    }

    function fetchDataForDate(date) {
        const [year, month, day] = date.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        const today = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(today.getFullYear() - 1);
        if (selectedDate < oneYearAgo) {
            alert('所選日期太久遠，資料可能不存在。請選擇近一年內的日期。');
            return;
        }

        if (selectedDate > today) {
            alert('無法選擇未來的日期。請選擇今天或之前的日期。');
            return;
        }

        const Ymd = year.toString() + month.toString().padStart(2, '0') + day.toString().padStart(2, '0');
        const jsonUrl = `data/genary/${year}/${Ymd}/list.json`;

        fetch(jsonUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: 此日期的資料不存在`);
                }
                return response.json();
            })
            .then(data => {
                updateTime = `${date} 00:00`;
                dataOptions = data.sort((a, b) => a.localeCompare(b));
                fetchAndPopulateSlider();

                setTimeout(() => {
                    ensureEmergencyDataForMonth(date).then(() => {
                        checkEmergencyGeneratorsForDate(date);
                    });
                }, 100);
            })
            .catch(error => {
                console.error('Error fetching data for selected date:', error);
                let errorMessage = '無法取得所選日期的資料。';
                if (error.message.includes('HTTP 404')) {
                    errorMessage = '所選日期的資料尚未提供，請選擇較近的日期。';
                } else if (error.message.includes('Failed to fetch')) {
                    errorMessage = '網路連線異常，請檢查網路連線後重試。';
                }

                alert(errorMessage + '\n請選擇其他日期。');
                const now = new Date();
                const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
                if (selectedDate !== today) {
                    selectedDate = today;
                    currentCalendarDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    updateDateDisplay();
                }
            });
    }

    function loadEmergencyDates() {
        fetch(`${emergencyApiBase}/monthly_index.json`)
            .then(response => response.json())
            .then(data => {
                emergencyMonthsData = data;
                emergencyDatesCache.clear();
                loadedMonths.clear();

                console.log(`Emergency data available for ${data.months?.length || 0} months`);

                const recentMonths = getRecentMonths(3);
                if (data.months && data.months.length > 0) {
                    const recentMonthsData = data.months.filter(m => recentMonths.includes(m.year_month));
                    if (recentMonthsData.length > 0) {
                        loadEmergencyDatesFromMonthly(recentMonthsData);
                    } else {
                        setupDatePickerHighlights();
                    }
                } else {
                    setupDatePickerHighlights();
                }
            })
            .catch(error => {
                console.error('Error loading emergency dates:', error);
                setupDatePickerHighlights();
            });
    }

    function getCurrentMonth() {
        const now = new Date();
        return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    function getRecentMonths(count) {
        const months = [];
        const now = new Date();

        for (let i = 0; i < count; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const yearMonth = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            months.push(yearMonth);
        }

        return months;
    }

    function ensureEmergencyDataForMonth(dateStr) {
        let yearMonth;
        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month] = dateStr.split('-');
            yearMonth = `${year}${month}`;
        } else {
            const date = (dateStr instanceof Date) ? dateStr : new Date(dateStr);
            yearMonth = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        }

        if (!loadedMonths.has(yearMonth) && emergencyMonthsData) {
            const monthData = emergencyMonthsData.months?.find(m => m.year_month === yearMonth);
            if (monthData) {
                return loadEmergencyDatesFromMonthly([monthData]);
            }
        }
        return Promise.resolve();
    }

    function loadEmergencyDatesFromMonthly(months) {
        const promises = months.map(month =>
            fetch(`${emergencyApiBase}/2025/${month.year_month}.json`)
            .then(response => response.json())
            .then(monthData => {
                if (monthData && monthData.dates && Array.isArray(monthData.dates) && monthData.dates.length > 0) {
                    monthData.dates.forEach(dateInfo => {
                        if (dateInfo && dateInfo.formatted_date) {
                            emergencyDatesCache.add(dateInfo.formatted_date);
                        }
                    });
                }
                loadedMonths.add(month.year_month);
            })
            .catch(error => console.warn(`Failed to load ${month.year_month}:`, error))
        );

        return Promise.all(promises).then(() => {
            console.log(`Loaded ${emergencyDatesCache.size} emergency dates from ${months.length} months`);
            setupDatePickerHighlights();
        });
    }

    function updateDateDisplay() {
        const dateDisplay = document.getElementById('datePickerDisplay');
        if (selectedDate) {
            dateDisplay.textContent = selectedDate;

            if (emergencyDatesCache.has(selectedDate)) {
                dateDisplay.classList.add('has-emergency');
                dateDisplay.title = `${selectedDate} - 此日期有緊急備用電力設施啟動記錄`;
            } else {
                dateDisplay.classList.remove('has-emergency');
                dateDisplay.title = '選擇日期查看歷史資料';
            }
        }
    }

    function renderCalendar() {
        const monthYearDisplay = document.getElementById('monthYearDisplay');
        const calendarGrid = document.getElementById('calendarGrid');
        calendarGrid.innerHTML = '';
        const displayedMonth = `${currentCalendarDate.getFullYear()}${(currentCalendarDate.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!loadedMonths.has(displayedMonth) && emergencyMonthsData) {
            const monthData = emergencyMonthsData.months?.find(m => m.year_month === displayedMonth);
            if (monthData) {
                loadEmergencyDatesFromMonthly([monthData]).then(() => {
                    renderCalendarContent();
                });
                return;
            }
        }

        renderCalendarContent();
    }

    function renderCalendarContent() {
        const monthYearDisplay = document.getElementById('monthYearDisplay');
        const calendarGrid = document.getElementById('calendarGrid');
        calendarGrid.innerHTML = '';
        const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月',
            '七月', '八月', '九月', '十月', '十一月', '十二月'
        ];
        monthYearDisplay.textContent = `${currentCalendarDate.getFullYear()}年 ${monthNames[currentCalendarDate.getMonth()]}`;
        const dayHeaders = ['日', '一', '二', '三', '四', '五', '六'];
        dayHeaders.forEach(day => {
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day-header';
            dayElement.textContent = day;
            calendarGrid.appendChild(dayElement);
        });
        const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
        const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        const prevMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 0);
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonth.getDate() - i;
            const dayElement = createDayElement(day, true, new Date(prevMonth.getFullYear(), prevMonth.getMonth(), day));
            calendarGrid.appendChild(dayElement);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
            const dayElement = createDayElement(day, false, dayDate);
            calendarGrid.appendChild(dayElement);
        }

        const totalCells = calendarGrid.children.length - 7;
        const remainingCells = 42 - totalCells;
        for (let day = 1; day <= remainingCells; day++) {
            const nextMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, day);
            const dayElement = createDayElement(day, true, nextMonth);
            calendarGrid.appendChild(dayElement);
        }
    }

    function createDayElement(day, isOtherMonth, fullDate) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        const dateStr = `${fullDate.getFullYear()}-${(fullDate.getMonth() + 1).toString().padStart(2, '0')}-${fullDate.getDate().toString().padStart(2, '0')}`;
        const now = new Date();
        const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }

        if (dateStr === today && !isOtherMonth) {
            dayElement.classList.add('today');
        }

        if (dateStr === selectedDate) {
            dayElement.classList.add('selected');
        }

        if (emergencyDatesCache.has(dateStr)) {
            dayElement.classList.add('emergency');
        }

        dayElement.addEventListener('click', () => {
            if (!isOtherMonth) {
                selectDate(dateStr);
            } else {
                if (fullDate < new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1)) {
                    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                } else {
                    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                }
                selectDate(dateStr);
                renderCalendar();
            }
        });

        return dayElement;
    }

    function selectDate(dateStr) {
        selectedDate = dateStr;
        updateDateDisplay();
        document.getElementById('customCalendar').style.display = 'none';
        calendarVisible = false;
        fetchDataForDate(dateStr);
        setTimeout(() => {
            ensureEmergencyDataForMonth(dateStr).then(() => {
                checkEmergencyGeneratorsForDate(dateStr);
            });
        }, 500);
    }

    function setupDatePickerHighlights() {
        console.log('Custom calendar initialized with emergency date highlighting');
    }


    function loadEmergencyDatesForRange(startDate, endDate) {
        if (!emergencyMonthsData) {
            return Promise.resolve();
        }
        const requiredMonths = new Set();
        const current = new Date(startDate);
        while (current <= endDate) {
            const yearMonth = `${current.getFullYear()}${(current.getMonth() + 1).toString().padStart(2, '0')}`;
            requiredMonths.add(yearMonth);
            current.setMonth(current.getMonth() + 1);
        }

        const monthsToLoad = Array.from(requiredMonths).filter(month => !loadedMonths.has(month));

        if (monthsToLoad.length === 0) {
            return Promise.resolve();
        }

        const promises = monthsToLoad.map(yearMonth => {
            const monthData = emergencyMonthsData.months.find(m => m.year_month === yearMonth);
            if (!monthData) {
                return Promise.resolve();
            }

            return fetch(`${emergencyApiBase}/2025/${yearMonth}.json`)
                .then(response => response.json())
                .then(data => {
                    if (data && data.dates && Array.isArray(data.dates) && data.dates.length > 0) {
                        data.dates.forEach(dateInfo => {
                            if (dateInfo && dateInfo.formatted_date) {
                                emergencyDatesCache.add(dateInfo.formatted_date);
                            }
                        });
                    }
                    loadedMonths.add(yearMonth);
                })
                .catch(error => console.warn(`Failed to load ${yearMonth}:`, error));
        });

        return Promise.all(promises);
    }

    function formatTimeSlots(timeSlotCount) {
        if (!timeSlotCount || timeSlotCount === 0) return '0 分鐘';

        const totalMinutes = timeSlotCount * 10;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0) {
            return `${minutes} 分鐘`;
        } else if (minutes === 0) {
            return `${hours} 小時`;
        } else {
            return `${hours} 小時 ${minutes} 分鐘`;
        }
    }

    window.openMonthlyEmergencyModal = openMonthlyEmergencyModal;

    window.loadEmergencyHistory = function() {
        const days = document.getElementById('emergencyDateRange').value;
        const generatorFilter = document.getElementById('emergencyGeneratorFilter').value;
        const emergencyUrl = `${emergencyApiBase}/monthly_index.json`;

        fetch(emergencyUrl)
            .then(response => response.json())
            .then(data => {
                displayEmergencyHistory(data, generatorFilter);
                setupEmergencyFilters(generatorFilter);
            })
            .catch(error => {
                console.error('Error loading emergency history:', error);
                document.getElementById('emergencyHistoryBody').innerHTML =
                    '<tr><td colspan="5" class="text-center text-danger">載入緊急備用電力設施歷史資料時發生錯誤</td></tr>';
            });
    }

    window.loadMonthDetails = function(yearMonth) {
        const monthUrl = `${emergencyApiBase}/2025/${yearMonth}.json`;

        fetch(monthUrl)
            .then(response => response.json())
            .then(data => {
                displayMonthDetails(data);
            })
            .catch(error => {
                console.error('Error loading month details:', error);
                alert('無法載入該月份的詳細資料');
            });
    }

    window.navigateToEmergencyDate = function(date) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('emergencyModal'));
        if (modal) {
            modal.hide();
        }

        if (date && date !== 'N/A') {
            selectedDate = date;
            const [year, month, day] = date.split('-');
            currentCalendarDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            updateDateDisplay();
            fetchDataForDate(date);
            setTimeout(() => {
                checkEmergencyGenerators();
            }, 100);
        }
    }

    function checkEmergencyGenerators() {
        const [date] = updateTime.split(' ');
        checkEmergencyGeneratorsForDate(date);
    }

    function checkEmergencyGeneratorsForDate(date) {
        if (!emergencyDatesCache.has(date)) {
            hideEmergencyAlert();
            return;
        }

        const [year, month, day] = date.split('-');
        const Ymd = year + month + day;

        const dailyIndexUrl = `${emergencyApiBase}/${year}/${Ymd}/index.json`;

        fetch(dailyIndexUrl)
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('No emergency data for this date');
            })
            .then(dailyIndex => {
                if (!Array.isArray(dailyIndex)) {
                    throw new Error('Invalid daily index format');
                }

                if (dailyIndex.length > 0) {
                    const allGenerators = new Set();
                    let totalEvents = 0;

                    dailyIndex.forEach(entry => {
                        if (entry && entry.generators && Array.isArray(entry.generators)) {
                            entry.generators.forEach(gen => allGenerators.add(gen));
                            totalEvents += entry.count || 0;
                        }
                    });

                    if (allGenerators.size > 0) {
                        const dailySummary = {
                            date: date,
                            total_events: totalEvents,
                            time_slots: dailyIndex.length,
                            generators: Array.from(allGenerators),
                            daily_index: dailyIndex
                        };

                        showEmergencyAlertForDate(dailySummary);

                        const currentTimeKey = getCurrentTimeKey();
                        const currentTimeEntry = dailyIndex.find(entry => entry && entry.time === currentTimeKey);

                        if (currentTimeEntry) {
                            fetch(`${emergencyApiBase}/${year}/${Ymd}/${currentTimeKey}.json`)
                                .then(response => response.json())
                                .then(data => {
                                    currentEmergencyData = data;
                                    showEmergencyAlertForDate(dailySummary, data);
                                })
                                .catch(error => {
                                    console.warn('Could not load current time emergency data:', error);
                                });
                        }
                    } else {
                        throw new Error('No emergency generators found in daily index');
                    }
                } else {
                    throw new Error('Empty daily index');
                }
            })
            .catch(error => {
                hideEmergencyAlert();
            });
    }

    function getCurrentTimeKey() {
        const slider = document.getElementById('timeSlider');
        if (slider && dataOptions.length > 0) {
            const selectedIndex = slider.value || slider.max;
            const selectedTime = dataOptions[selectedIndex];
            return selectedTime.replace('.json', '');
        }
        return '235900';
    }

    function showEmergencyAlert(generators) {
        const alert = document.getElementById('emergencyAlert');
        const container = document.getElementById('emergencyGenerators');

        if (generators && generators.length > 0) {
            container.innerHTML = '';
            generators.forEach(gen => {
                const item = document.createElement('span');
                item.className = 'emergency-generator-item';
                item.innerHTML = `${gen.name}: ${gen.output}MW <small>(${gen.status || 'Unknown'})</small>`;
                container.appendChild(item);
            });

            alert.classList.remove('d-none');
            alert.addEventListener('click', openDailyEmergencyModal);
        } else {
            hideEmergencyAlert();
        }
    }

    function showEmergencyAlertForDate(dailySummary, currentTimeData = null) {
        const alert = document.getElementById('emergencyAlert');
        const container = document.getElementById('emergencyGenerators');

        if (dailySummary && dailySummary.generators && dailySummary.generators.length > 0) {
            container.innerHTML = '';
            if (currentTimeData && currentTimeData.active_emergency_generators && currentTimeData.active_emergency_generators.length > 0) {
                const currentTitle = document.createElement('div');
                currentTitle.innerHTML = '<strong>當前時段:</strong>';
                currentTitle.style.marginBottom = '4px';
                container.appendChild(currentTitle);

                currentTimeData.active_emergency_generators.forEach(gen => {
                    const item = document.createElement('span');
                    item.className = 'emergency-generator-item';
                    item.style.backgroundColor = 'rgba(255, 193, 7, 0.3)';
                    item.innerHTML = `${gen.name}: ${gen.output}MW <small>(${gen.status || 'Active'})</small>`;
                    container.appendChild(item);
                });

                const separator = document.createElement('div');
                separator.innerHTML = '<small><strong>今日所有啟動:</strong></small>';
                separator.style.margin = '8px 0 4px 0';
                container.appendChild(separator);
            }

            dailySummary.generators.forEach(genName => {
                const item = document.createElement('span');
                item.className = 'emergency-generator-item';
                item.innerHTML = `${genName}`;
                container.appendChild(item);
            });

            const summaryInfo = document.createElement('div');
            summaryInfo.style.marginTop = '8px';
            summaryInfo.innerHTML = `<small>共 ${dailySummary.total_events} 次啟動，持續 ${formatTimeSlots(dailySummary.time_slots)}</small>`;
            container.appendChild(summaryInfo);

            alert.classList.remove('d-none');
            alert.addEventListener('click', openDailyEmergencyModal);
        } else {
            hideEmergencyAlert();
        }
    }

    function hideEmergencyAlert() {
        const alert = document.getElementById('emergencyAlert');
        alert.classList.add('d-none');
        alert.removeEventListener('click', openDailyEmergencyModal);
    }

    function openDailyEmergencyModal() {
        const modal = new bootstrap.Modal(document.getElementById('dailyEmergencyModal'));
        modal.show();
        loadDailyEmergencyDetails();
    }

    function openEmergencyModal() {
        const modal = new bootstrap.Modal(document.getElementById('emergencyModal'));
        modal.show();
        loadEmergencyHistory();
    }

    function openMonthlyEmergencyModal() {
        const dailyModal = bootstrap.Modal.getInstance(document.getElementById('dailyEmergencyModal'));
        if (dailyModal) {
            dailyModal.hide();
        }

        setTimeout(() => {
            openEmergencyModal();
        }, 300);
    }

    function loadDailyEmergencyDetails() {
        const [date] = updateTime.split(' ');
        const [year, month, day] = date.split('-');
        const Ymd = year + month + day;

        const contentDiv = document.getElementById('dailyEmergencyContent');
        const modalTitle = document.getElementById('dailyEmergencyModalLabel');

        modalTitle.textContent = `${date} 緊急備用電力設施詳情`;
        contentDiv.innerHTML = '<div class="text-center">載入中...</div>';

        const dailyIndexUrl = `${emergencyApiBase}/${year}/${Ymd}/index.json`;

        fetch(dailyIndexUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`No data for ${date}`);
                }
                return response.json();
            })
            .then(dailyIndex => {
                if (!Array.isArray(dailyIndex) || dailyIndex.length === 0) {
                    throw new Error('No emergency data');
                }

                displayDailyEmergencyDetails(date, dailyIndex);
            })
            .catch(error => {
                contentDiv.innerHTML = `
                    <div class="alert alert-info text-center">
                        <h5><i class="fas fa-info-circle"></i> 本日無緊急備用電力設施啟動</h5>
                        <p>選定的日期 (${date}) 沒有緊急備用電力設施啟動記錄。</p>
                    </div>
                `;
            });
    }

    function compactContinuousTimeSlots(sortedIndex) {
        if (!sortedIndex || sortedIndex.length === 0) return [];

        const compacted = [];
        let currentGroup = null;

        for (let i = 0; i < sortedIndex.length; i++) {
            const entry = sortedIndex[i];
            const currentTime = entry.time;
            const currentGenerators = entry.generators ? entry.generators.sort().join(',') : '';

            const isContinuous = currentGroup &&
                isConsecutiveTimeSlot(currentGroup.endTime, currentTime) &&
                currentGroup.generatorsKey === currentGenerators;

            if (isContinuous) {
                currentGroup.endTime = currentTime;
                currentGroup.endTimeDisplay = formatTimeString(currentTime);
            } else {
                if (currentGroup) {
                    compacted.push(createTimelineEntry(currentGroup));
                }

                currentGroup = {
                    startTime: currentTime,
                    endTime: currentTime,
                    startTimeDisplay: formatTimeString(currentTime),
                    endTimeDisplay: formatTimeString(currentTime),
                    generators: entry.generators || [],
                    generatorsKey: currentGenerators
                };
            }
        }

        if (currentGroup) {
            compacted.push(createTimelineEntry(currentGroup));
        }

        return compacted;
    }

    function isConsecutiveTimeSlot(time1, time2) {
        const hour1 = parseInt(time1.substring(0, 2));
        const minute1 = parseInt(time1.substring(2, 4));
        const second1 = parseInt(time1.substring(4, 6));

        const hour2 = parseInt(time2.substring(0, 2));
        const minute2 = parseInt(time2.substring(2, 4));
        const second2 = parseInt(time2.substring(4, 6));

        const totalSeconds1 = hour1 * 3600 + minute1 * 60 + second1;
        const totalSeconds2 = hour2 * 3600 + minute2 * 60 + second2;

        return (totalSeconds2 - totalSeconds1) === 600;
    }

    function formatTimeString(timeStr) {
        return `${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:${timeStr.substring(4,6)}`;
    }

    function createTimelineEntry(group) {
        let timeDisplay;
        if (group.startTime === group.endTime) {
            timeDisplay = group.startTimeDisplay;
        } else {
            timeDisplay = `${group.startTimeDisplay} - ${group.endTimeDisplay}`;
        }

        return {
            timeDisplay: timeDisplay,
            generators: group.generators,
            startTime: group.startTime,
            endTime: group.endTime
        };
    }

    function displayDailyEmergencyDetails(date, dailyIndex) {
        const contentDiv = document.getElementById('dailyEmergencyContent');

        const allGenerators = new Set();
        let totalEvents = 0;
        let timeSlots = dailyIndex.length;

        dailyIndex.forEach(entry => {
            if (entry && entry.generators && Array.isArray(entry.generators)) {
                entry.generators.forEach(gen => allGenerators.add(gen));
                totalEvents += entry.count || 0;
            }
        });

        let content = `
            <div class="card mb-3">
                <div class="card-header bg-warning">
                    <h5 class="mb-0"><i class="fas fa-exclamation-triangle"></i> 當日摘要</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <strong>啟動設施數量：</strong><br>
                            <span class="fs-4 text-primary">${allGenerators.size}</span> 個
                        </div>
                        <div class="col-md-4">
                            <strong>總啟動次數：</strong><br>
                            <span class="fs-4 text-warning">${totalEvents}</span> 次
                        </div>
                        <div class="col-md-4">
                            <strong>持續時間：</strong><br>
                            <span class="fs-4 text-danger">${formatTimeSlots(timeSlots)}</span>
                        </div>
                    </div>
                    <hr>
                    <div>
                        <strong>啟動設施清單：</strong><br>
                        ${Array.from(allGenerators).map(gen => `<span class="badge bg-secondary me-1 mb-1">${gen}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;

        content += `
            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0"><i class="fas fa-clock"></i> 時間軸詳情</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead>
                                <tr>
                                    <th>時間</th>
                                    <th>啟動設施</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        const sortedIndex = dailyIndex.sort((a, b) => a.time.localeCompare(b.time));

        const compactedTimeline = compactContinuousTimeSlots(sortedIndex);

        compactedTimeline.forEach(entry => {
            const generators = entry.generators ? entry.generators.join(', ') : '無';

            content += `
                <tr>
                    <td><strong>${entry.timeDisplay}</strong></td>
                    <td>${generators}</td>
                </tr>
            `;
        });

        content += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        contentDiv.innerHTML = content;
    }


    function displayEmergencyHistory(monthlyData, generatorFilter = 'all') {
        const tbody = document.getElementById('emergencyHistoryBody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">處理資料中...</td></tr>';

        const timelineData = [];
        const timelineLabels = [];

        let historyHtml = '';
        if (monthlyData.months && monthlyData.months.length > 0) {
            const months = monthlyData.months.slice(-3);

            if (generatorFilter !== 'all') {
                historyHtml += `
                    <tr class="table-warning">
                        <td colspan="5" class="text-center">
                            <strong>篩選條件：${generatorFilter}</strong><br>
                            <small>正在載入篩選結果...</small>
                        </td>
                    </tr>
                `;
                tbody.innerHTML = historyHtml;

                loadFilteredEmergencyHistory(months, generatorFilter);
                return;
            }

            months.forEach(month => {
                timelineLabels.push(`${month.year}-${month.month}`);
                timelineData.push(month.total_days);

                historyHtml += `
                    <tr class="table-info">
                        <td colspan="5">
                            <strong>${month.year} 年 ${month.month} 月</strong> - 
                            共 ${month.total_days} 天有緊急備用電力設施啟動記錄
                            <button class="btn btn-sm btn-outline-primary ms-2" onclick="loadMonthDetails('${month.year_month}')">
                                查看詳細
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        if (historyHtml === '') {
            historyHtml = '<tr><td colspan="5" class="text-center">近期無緊急備用電力設施啟動記錄</td></tr>';
        }

        tbody.innerHTML = historyHtml;

        createEmergencyTimelineChart(timelineLabels, timelineData);
    }

    function loadFilteredEmergencyHistory(months, generatorFilter) {
        const tbody = document.getElementById('emergencyHistoryBody');

        const promises = months.map(month =>
            fetch(`${emergencyApiBase}/2025/${month.year_month}.json`)
            .then(response => response.json())
            .then(monthData => {
                if (monthData && monthData.dates && Array.isArray(monthData.dates)) {
                    const filteredDates = monthData.dates.filter(dateInfo => {
                        if (!dateInfo.unique_generators) return false;

                        let generators = [];
                        if (Array.isArray(dateInfo.unique_generators)) {
                            generators = dateInfo.unique_generators;
                        } else if (typeof dateInfo.unique_generators === 'object') {
                            generators = Object.values(dateInfo.unique_generators);
                        } else {
                            generators = [String(dateInfo.unique_generators)];
                        }

                        return generators.some(gen =>
                            gen.toString().toLowerCase().includes(generatorFilter.toLowerCase())
                        );
                    });

                    return {
                        ...monthData,
                        dates: filteredDates,
                        original_total: monthData.dates.length,
                        filtered_total: filteredDates.length
                    };
                }
                return null;
            })
            .catch(error => {
                console.warn(`Failed to load ${month.year_month}:`, error);
                return null;
            })
        );

        Promise.all(promises).then(results => {
            let filteredHtml = '';
            let totalFilteredDays = 0;

            results.forEach(monthData => {
                if (monthData && monthData.dates.length > 0) {
                    totalFilteredDays += monthData.dates.length;

                    filteredHtml += `
                        <tr class="table-info">
                            <td colspan="5">
                                <strong>${monthData.year} 年 ${monthData.month} 月</strong> - 
                                找到 ${monthData.dates.length} 天包含「${generatorFilter}」的記錄
                                (總共 ${monthData.original_total} 天)
                            </td>
                        </tr>
                    `;

                    monthData.dates.forEach(dateInfo => {
                        let generatorsText = 'N/A';
                        if (dateInfo.unique_generators) {
                            if (Array.isArray(dateInfo.unique_generators)) {
                                generatorsText = dateInfo.unique_generators.join(', ');
                            } else if (typeof dateInfo.unique_generators === 'object') {
                                generatorsText = Object.values(dateInfo.unique_generators).join(', ');
                            } else {
                                generatorsText = String(dateInfo.unique_generators);
                            }
                        }

                        const timesCount = (dateInfo.times && Array.isArray(dateInfo.times)) ? dateInfo.times.length : 0;
                        const eventsCount = dateInfo.events || 0;

                        filteredHtml += `
                            <tr>
                                <td>
                                    <span class="emergency-date-clickable" onclick="navigateToEmergencyDate('${dateInfo.formatted_date || 'N/A'}')" title="點擊切換到此日期">
                                        ${dateInfo.formatted_date || 'N/A'}
                                    </span>
                                </td>
                                <td colspan="2">${generatorsText}</td>
                                <td>${eventsCount} 次</td>
                                <td>${formatTimeSlots(timesCount)}</td>
                            </tr>
                        `;
                    });
                }
            });

            if (filteredHtml === '') {
                filteredHtml = `
                    <tr>
                        <td colspan="5" class="text-center text-muted">
                            沒有找到包含「${generatorFilter}」的緊急備用電力設施記錄
                        </td>
                    </tr>
                `;
            } else {
                filteredHtml = `
                    <tr class="table-success">
                        <td colspan="5" class="text-center">
                            <strong>篩選結果：共找到 ${totalFilteredDays} 天包含「${generatorFilter}」的記錄</strong>
                        </td>
                    </tr>
                ` + filteredHtml;
            }

            tbody.innerHTML = filteredHtml;
        });
    }

    function createEmergencyTimelineChart(labels, data) {
        const ctx = document.getElementById('emergencyTimelineChart').getContext('2d');

        if (emergencyTimelineChart) {
            emergencyTimelineChart.destroy();
        }

        emergencyTimelineChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '緊急備用電力設施啟動天數',
                    data: data,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '啟動天數'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '月份'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: '緊急備用電力設施月度啟動統計'
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });
    }


    function displayMonthDetails(monthData) {
        const tbody = document.getElementById('emergencyHistoryBody');
        let detailsHtml = `
            <tr class="table-secondary">
                <td colspan="5">
                    <strong>${monthData.year} 年 ${monthData.month} 月詳細記錄</strong>
                    <button class="btn btn-sm btn-outline-secondary ms-2" onclick="loadEmergencyHistory()">
                        返回摘要
                    </button>
                </td>
            </tr>
        `;

        if (monthData.dates && monthData.dates.length > 0) {
            monthData.dates.forEach(dateInfo => {
                let generatorsText = 'N/A';
                if (dateInfo.unique_generators) {
                    if (Array.isArray(dateInfo.unique_generators)) {
                        generatorsText = dateInfo.unique_generators.join(', ');
                    } else if (typeof dateInfo.unique_generators === 'object') {
                        const generators = Object.values(dateInfo.unique_generators);
                        generatorsText = generators.join(', ');
                    } else {
                        generatorsText = String(dateInfo.unique_generators);
                    }
                }

                const timesCount = (dateInfo.times && Array.isArray(dateInfo.times)) ? dateInfo.times.length : 0;
                const eventsCount = dateInfo.events || 0;

                detailsHtml += `
                    <tr>
                        <td>
                            <span class="emergency-date-clickable" onclick="navigateToEmergencyDate('${dateInfo.formatted_date || 'N/A'}')" title="點擊切換到此日期">
                                ${dateInfo.formatted_date || 'N/A'}
                            </span>
                        </td>
                        <td colspan="2">${generatorsText}</td>
                        <td>${eventsCount} 次</td>
                        <td>${formatTimeSlots(timesCount)}</td>
                    </tr>
                `;
            });
        } else {
            detailsHtml += `
                <tr>
                    <td colspan="5" class="text-center text-muted">此月份無緊急備用電力設施啟動記錄</td>
                </tr>
            `;
        }

        tbody.innerHTML = detailsHtml;
    }

    function setupEmergencyFilters(currentFilter = 'all') {
        const filterSelect = document.getElementById('emergencyGeneratorFilter');
        const dateRangeSelect = document.getElementById('emergencyDateRange');

        const previousValue = currentFilter || filterSelect.value || 'all';

        if (!filterSelect.hasAttribute('data-setup')) {
            const commonGenerators = [
                '核二 Gas1', '核二 Gas2', '核三 Gas1', '核三 Gas2',
                '台中 Gas1&2', '台中 Gas3&4', '大林 #5',
                '興達 #1', '興達 #2', '興達 #3', '興達 #4'
            ];

            filterSelect.innerHTML = '<option value="all">全部緊急備用電力設施</option>';
            commonGenerators.forEach(gen => {
                const option = document.createElement('option');
                option.value = gen;
                option.textContent = gen;
                filterSelect.appendChild(option);
            });

            dateRangeSelect.addEventListener('change', loadEmergencyHistory);
            filterSelect.addEventListener('change', loadEmergencyHistory);
            filterSelect.setAttribute('data-setup', 'true');
        }
        filterSelect.value = previousValue;
    }

});