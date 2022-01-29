// ==UserScript==
// @name         Hentaiverse Battle Stats
// @namespace    hvbstats
// @version      1.1.3
// @author       firew
// @description  Needs HV Utils and HV Monsterbation to work
// @match        *://*.hentaiverse.org/*
// @exclude      *hentaiverse.org/equip/*
// @grant        none
// ==/UserScript==

/*Setup Instructions:
1. Install Monsterbation script and HVUtils script. This script uses data from both of these scripts to function.
2. In Monsterbation,
    set all track* to true (trackDamage, trackUsage, etc.)
    set deleteDropLog and deleteCombatLog to 2 (delete at end of battle).

Known Bugs:
1. There is no separation of price data between isekai/persistent.
   This will be retroactively fixed in a later release.
   This bug is only visual. The data is properly stored.

2. Modified Arena and Ring of Blood pages will show aggregate data from both isekai and persistent.
   This will also be retroactively fixed in a later release.
   This bug is only visual. The data is properly stored.

3. If the data in localstorage provided by HVUtils and Monsterbation are not accurate,
   these stats will also not be accurate.
   EX. Swapping sets and starting battle too quickly
   EX. Swapping to a different device.
*/

(function() {
    //----------------------------------------------------------------------------------------------------------------------
    //-------------Settings
    //----------------------------------------------------------------------------------------------------------------------
    //General Settings
    const export_type = 'all'; //'all', 'year', or 'month'. Will default to 'year' if invalid setting.
    const export_limit = 2; // 50 //How many previous months/years to export.
    const stat_rows = ['Average','Total','Max','Min']; //Attach statistical aggregation rows to the top. Available: 'Average', 'Total','Max','Min'

    //Default filter settings
    const default_rows = 50;
    const aggregate_by_day = true;
    const include_manually_ignored_stats = false;
    const default_isekai = ['Persistent','Isekai'];
    const default_difficulties = ['PFUDOR','IWBTH','Nintendo','Hell','Nightmare'];
    const default_results = ['Victory','Flee'];
    const default_days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    //Table Columns - You can comment/remove any column. You can also reorder the columns or move them into different groups.
    let table_columns = {
        'Speed': [
            {column_name: 'Timestamp', field: 'timestamp', tooltip: 'ignore_button'},
            {column_name: 'Realm', field: 'isekai'},
            {column_name: 'Diff', field: 'difficulty'},
            {column_name: 'Result', field: 'result', tooltip: 'defeat'},
            {column_name: 'C. Rounds', field: 'completed_rounds'},
            {column_name: 'Time', field: 'seconds',format: 'time_string'},
            {column_name: 'Turns', field: 'turns', },
            {column_name: 'TPS', numerator: 'turns', denominator: 'seconds'},
            {column_name: 'SPR', numerator: 'seconds', denominator: 'rounds'},
        ],
        'Details': [
            {column_name: 'Level', field: 'level'},
            {column_name: 'Persona', field: 'persona', tooltip: 'equipped'},
            {column_name: 'Prof', presence: 'proficiency', tooltip: 'proficiency'}
        ],
        'Money':[
            {column_name: 'Profit', field: 'profit', bins: {100000: "color: #922099", 200000: "color: #299ec4", 300000: "color: #209928"}},
            {column_name: 'P/Second', numerator: 'profit', denominator: 'seconds'},
            {column_name: 'P/Turn', numerator: 'profit', denominator: 'turns'}
        ],
        'Usage Breakdown': [
            {column_name: 'Imperil', usage: 'Imperil'},
            {column_name: 'Spell', sum_usage: ['Paradise Lost','Banishment','Smite'], tooltip: 'sum_usage'},
            {column_name: 'Heal', sum_usage: ['Full-Cure','Cure','Health Potion','Health Elixir'], tooltip: 'sum_usage'},
            {column_name: 'Gem', sum_usage: ['Spirit Gem','Mana Gem','Health Gem','Mystic Gem'], tooltip: 'sum_usage'}
        ],
        'Drops': [
            {column_name: 'Legs', drops: 'Legendary', tooltip: 'Equips', keyword: 'Legendary'},
            {column_name: 'Peer', drops: 'Peerless', tooltip: 'Equips', keyword: 'Peerless'},
            {column_name: 'Equip', drops: 'Equipment'},
            {column_name: 'PA', drops: 'Precursor Artifact'},
            {column_name: 'Hoarded', sum_drops: ['Hoarded Face Masks','Hoarded Toilet Paper','Hoarded Dried Pasta','Hoarded Canned Goods','Hoarded Powdered Milk','Hoarded Disinfecting Wipes','Hoarded Hand Sanitizer']},
            {column_name: 'Trophies', sum_drops: ['ManBearPig Tail','Holy Hand Grenade of Antioch', "Mithra's Flower",'Dalek Voicebox','Lock of Blue Hair','Bunny-Girl Costume','Hinamatsuri Doll','Broken Glasses','Black T-Shirt','Sapling','Unicorn Horn','Noodly Appendage']},
            {column_name: 'Crystals', drops: 'Crystal'},
        ],
        'Consumable Usage': [
            {column_name: 'SP', usage: 'Spirit Potion'},
            {column_name: 'SE', usage: 'Spirit Elixir'},
            {column_name: 'Life', usage: 'Scroll of Life'},
            {column_name: "100's", sum_usage: ['Scroll of Protection','Scroll of Swiftness','Scroll of Shadows'], tooltip: 'sum_usage' },
            {column_name: "200's", sum_usage: ['Scroll of the Avatar','Scroll of the Gods'], tooltip: 'sum_usage'}
        ],
        'Consumable Diff': [
            {column_name: 'Life', difference: 'Scroll of Life'},
            {column_name: "100's", sum_difference: ['Scroll of Protection','Scroll of Swiftness','Scroll of Shadows'], tooltip: 'sum_difference'},
            {column_name: "200's", sum_difference: ['Scroll of the Avatar','Scroll of the Gods'], tooltip: 'sum_difference'}
        ]
    };



    //Base Columns:
    //  field: returns a single value
    //  numerator/denominator: returns the numerator / denominator
    //  presence: returns if the value appears in the data
    //  usage: returns how many times an action was used
    //  sum_usage: returns the sum of the usage of all actions in the array
    //  drops: returns how many times an item was dropped
    //  sum_drops: returns the sum of all dropped items in the array
    //  difference: returns drops - usage of an item.
    //  sum_difference: returns the sum of all drops - the sum of all usage of all items in the array

    //Modifiers:
    //  format: modifies the value. Available options: 'time_string'
    //  tooltip: Adds a hoverable tooltip that contains additional information. Available options: 'Equips', 'equipped', 'proficiency', 'sum_usage', 'sum_drops', 'sum_difference'
    //  bins: if the given value is higher than a bin value, will apply the specified css style. EX: {100000: "color: #922099", 200000: "color: #299ec4"}
    //Aggregate row logic:
    //  For sum_* functions in min/max rows, it finds the minimum of each item in all the data -> Adds those minimums up.

    //Prices - You can adjust these values depending on current prices. You can omit items from the value calcuation by setting the value to 0.
    let prices = {
        Stamina: 8800, //This is used in cost calculations.

        Equipment: {PFUDOR: 508, //Equipment prices are estimates (only PFUDOR's value is founded on any statistical aggregation. the rest are guesses. Ignores mag+ cloth)
            IWBTH: 460,
            Nintendo: 400,
            Hell: 375,
            Nightmare: 350,
            Hard: 325,
            Normal: 300},

        //Special
        Crystal: 20500/12000,
        'Precursor Artifact': 20000,
        Figurine: 16000,
        'Amnesia Shard': 8800,
        'Aether Shard': 2300,
        'Featherweight Shard': 75,
        'Voidseeker Shard': 75,

        //Trophies
        'ManBearPig Tail': 2100,
        'Holy Hand Grenade of Antioch': 2100,
        "Mithra's Flower": 2100,
        'Dalek Voicebox': 2100,
        'Lock of Blue Hair': 2100,
        'Bunny-Girl Costume':  4000,
        'Hinamatsuri Doll': 4000,
        'Broken Glasses': 4000,
        'Black T-Shirt': 12800,
        Sapling: 9500,
        'Unicorn Horn': 13600,
        'Noodly Appendage': 43000,

        //Draughts/Potions/Elixirs
        'Health Draught': 1,
        'Health Potion': 30,
        'Health Elixir': 350,
        'Mana Draught': 4,
        'Mana Potion': 90,
        'Mana Elixir': 500,
        'Spirit Draught': 15,
        'Spirit Potion': 90,
        'Spirit Elixir': 900,

        'Bubble-Gum': 15000,
        'Flower Vase': 15000,

        //Infusions/Scrolls
        'Infusion of Flames': 0, // 140,
        'Infusion of Frost': 0, // 140,
        'Infusion of Lightning': 0, // 140,
        'Infusion of Storms': 0, // 265,
        'Infusion of Darkness': 0, // 160,
        'Infusion of Divinity': 0, // 3000,
        'Scroll of Life': 400,
        'Scroll of Absorption': 20,
        'Scroll of Shadows': 200,
        'Scroll of Swiftness': 200,
        'Scroll of Protection': 500,
        'Scroll of the Gods': 580,
        'Scroll of the Avatar': 1300,

        //Food
        'Monster Chow': 0, //3,
        'Monster Edibles': 0, //5,
        'Monster Cuisine': 0, //6,
        'Happy Pills': 0, //550,

        //Materials
        'Scrap Metal': 89,
        'Scrap Leather': 89,
        'Scrap Cloth': 89,
        'Scrap Wood': 89,
        'Energy Cell': 180,

        'High-Grade Metals': 300,
        'High-Grade Leather': 100,
        'High-Grade Cloth': 13000,
        'High-Grade Wood': 3000,

        'Mid-Grade Metals': 100,
        'Mid-Grade Leather': 50,
        'Mid-Grade Cloth': 400,
        'Mid-Grade Wood': 200,

        'Low-Grade Metals': 10,
        'Low-Grade Leather': 10,
        'Low-Grade Cloth': 10,
        'Low-Grade Wood': 10,

        //Tokens
        Blood: 0,
        Chaos: 0,
        Soul: 0,
    };

    //----------------------------------------------------------------------------------------------------------------------
    //-------------BattleStats Class
    //----------------------------------------------------------------------------------------------------------------------
    class BattleStats {
        constructor(json_obj,detail) {
            if (json_obj) {//Create it from record.
                for (let k in json_obj) {this[k] = json_obj[k];}
            } else {
                //Isekai
                if (window.location.href.includes("/isekai/")) {
                    this.isekai = true
                }

                //HVUTils storage
                let ch_style = JSON.parse(this.isekai ? localStorage.hvuti_ch_style : localStorage.hvut_ch_style);
                this.difficulty = ch_style.difficulty;
                this.fighting_style = ch_style['Fighting Style'];
                let persona = JSON.parse(this.isekai ? localStorage.hvuti_persona : localStorage.hvut_persona);
                this.persona = persona.plist[persona.pidx].name;
                let equip_set = JSON.parse(this.iseka ? localStorage.hvuti_eq_set : localStorage.hvut_eq_set);
                let equip_array = []; //cut out extra fluff info from equip_set
                for (let i = 0; i < equip_set.length; i++) {
                    equip_array.push(equip_set[i].eid + "," + equip_set[i].key)
                }
                this.equip_set = equip_array;

                //Monsterbation
                let bs_timeLog = detail.timelog;
                this.timestamp = (new Date(bs_timeLog.startTime)).toISOString().slice(0, 19).replace('T', ' ');
                this.seconds = Math.round((Date.now() - bs_timeLog.startTime) / 10) / 100; //precise to the 100's place.
                this.turns = bs_timeLog.action;
                this.date = this.timestamp.substring(0, 10); //Used for index
                this.rounds = parseInt(bs_timeLog.rounds) || 1; //There are no rounds in REs

                //From page
                this.level = parseInt(document.getElementById("mkey_1").getElementsByClassName('fc4')[0].innerText);
                var result_text = document.getElementById("btcp").innerText;
                //rounds, battle_type: Arena, RoB, IW, GF, or RE
                if (result_text.includes('Arena challenge')) {
                    if (this.rounds == 1) {
                        this.battle_type = 'RoB';
                        let monsters = Array.from(document.getElementById('pane_monster').children).map(x => x.getElementsByClassName('fc2')[0].innerText)
                        if (monsters.includes('Flying Spaghetti Monster') && monsters.includes('Invisible Pink Unicorn')) {
                            this.rob_level = 7 //0-based index of the challenge
                        } else if (monsters.includes('Flying Spaghetti Monster')) {
                            this.rob_level = 6
                        } else if (monsters.includes('Invisible Pink Unicorn')) {
                            this.rob_level = 5
                        } else if (monsters.includes('Real Life')) {
                            this.rob_level = 4
                        } else if (monsters.includes('Yuki Nagato')) {
                            this.rob_level = 3
                        } else if (monsters.includes('Ryouko Asakura')) {
                            this.rob_level = 2
                        } else if (monsters.includes('Mikuru Asahina')) {
                            this.rob_level = 1
                        } else if (monsters.includes('Konata')) {
                            this.rob_level = 0
                        }
                    } else {
                        this.battle_type = 'Arena'
                    }
                } else if (result_text.includes('world')) {
                    this.battle_type = 'IW'
                } else if (result_text.includes('rindfest')) {
                    this.battle_type = 'GF'
                } else if (result_text.includes('Tower')) {
                    this.battle_type = 'Tower'
                } else {
                    this.battle_type = 'RE';
                    this.rounds = 1
                }

                //Result
                if (result_text.includes('You are victorious!')) {
                    this.result = 'Victory'
                    if (this.battle_type == 'IW') { //Record the potencies and pxp
                        this.iw_result = Array.from(document.getElementById("textlog").rows).filter(r => r.innerText.includes("Unlocked innate potential:") || r.innerText.includes("The equipment's potential has increased by")).map(x => x.innerText.replace("Unlocked innate potential: ", "").replace("Level ", "").replace("The equipment's potential has increased by ", "").replace(" points!", "pxp"))
                    }
                } else if (result_text.includes('You have been defeated!')) {
                    this.result = 'Defeat';
                    this.completed_rounds = bs_timeLog.round - 1; //The current round is not completed, so subtract 1
                    this.log = Array.from(document.getElementById("textlog").rows).map(x => x.innerText).join('\n')
                } else if (result_text.includes('You have run away!')) {
                    this.result = 'Flee';
                    this.completed_rounds = bs_timeLog.round - 1 //The current round is not completed, so subtract 1
                }

                this.combat = detail.combatlog;

                let drops = detail.droplog;
                let formatted_drops = {};
                let entries = Object.entries(drops);
                for (let i = 0; i < entries.length; i++) {
                    if (entries[i][1].constructor === Object) {
                        if (entries[i][0] == 'Equips') {
                            if (Object.entries(entries[i][1]).length > 0) {
                                formatted_drops.Equips = entries[i][1]
                            }
                        } else if (Object.entries(entries[i][1]).length) { //Not an empty array
                            let sub_entries = Object.entries(entries[i][1]);
                            for (let j = 0; j < sub_entries.length; j++) {
                                if (entries[i][0] == 'proficiency') {
                                    if (!this.proficiency) {
                                        this.proficiency = {}
                                    } //If you want to fix this back to under drops, instead of this.proficiency, use formatted_drops.proficiency = {}
                                    this.proficiency[sub_entries[j][0]] = Number(sub_entries[j][1].toFixed(8))
                                } else {
                                    formatted_drops[sub_entries[j][0]] = sub_entries[j][1]
                                }
                            }
                        }
                    } else { //Should be a number
                        formatted_drops[entries[i][0]] = entries[i][1] //Copy the number
                    }
                }
                this.drops = formatted_drops
            }
        }
    }

    BattleStats.prototype.generateDBRecord = function() {
        let data = {drops: this.drops,
            combat: this.combat,
            timestamp: this.timestamp,
            result: this.result,
            battle_type: this.battle_type,
            rounds: this.rounds,
            turns: this.turns,
            seconds: this.seconds,
            difficulty: this.difficulty,
            fighting_style: this.fighting_style,
            persona: this.persona,
            equip_set: this.equip_set,
            level: this.level,
            date: this.date
        };
        if ('rob_level' in this) {data.rob_level = this.rob_level}
        if (this.completed_rounds) {data.completed_rounds = this.completed_rounds}
        if (this.proficiency) {data.proficiency = this.proficiency}
        if (this.iw_result) {data.iw_result = this.iw_result}
        if (this.log) {data.log = this.log}
        if (this.ignore) {data.ignore = this.ignore}
        if (this.isekai) {data.isekai = this.isekai}
        return data
    };

    BattleStats.prototype.saveToDB = function() {
        let pointer = this;
        let request = self.indexedDB.open('Battle Stats');
        request.onsuccess = function(event) {
            let os_req = event.target.result.transaction('battles', "readwrite").objectStore("battles").put(pointer.generateDBRecord())
            os_req.onsuccess = function(event) {
                console.log("Battle Stat Successfully Saved");
                console.log(pointer)
                pointer.addSaveText()
            }
        }
    }

    BattleStats.prototype.addSaveText = function() { //Add under turn information.
        let btcp = document.getElementById("btcp");
        if (btcp) {
            btcp.appendChild(document.createElement('br'));
            let span = btcp.appendChild(document.createElement('span'));
            span.innerText = "Added to Battle Stats!"
        }
    }

    //----------------------------------------------------------------------------------------------------------------------
    //-------------Data Loading
    //----------------------------------------------------------------------------------------------------------------------
    function addData(index,lower_bound,upper_bound,table_div,filters,arena_row=false) { //For querying against battle stat
        getTableParent().children[1].classList.add('hbs-querying');
        let stats = [];
        let request = self.indexedDB.open('Battle Stats');
        request.onsuccess = function(event) {
            let os = event.target.result.transaction('battles', "readonly").objectStore("battles");
            let key_range = IDBKeyRange.bound(lower_bound, upper_bound); //Get all within bound
            let key_req = (index === 'default' ? os : os.index(index)).openCursor(key_range, 'prevunique');
            let i = 0;
            key_req.onsuccess = function(e) {
                if (arena_row || document.getElementById(table_div.id)) {
                    let cursor = e.target.result;
                    if (cursor && i < filters.limit) {
                        if (index.includes('date')) {
                            let daily_req;
                            if (index === 'date') {
                                daily_req = os.index('date').getAll(cursor.key);
                            } else {
                                daily_req = os.index('date,battle_type').getAll([cursor.key[1], lower_bound[0]]); //Since we queried battle_type before, we can reuse lower_bound as the battle_type.
                            }
                            daily_req.onsuccess = function(ev) {
                                let results = ev.target.result;
                                if (results.length > 0) {
                                    results = results.map(x=> processData(x)).filter(x=> filterData(x,filters));
                                    if (results.length > 0) {
                                        i += 1;
                                        stats.push(generateAggregate(results, 'Total', results[0].date));
                                        if (stats.length === filters.limit) {
                                            fillTable(stats,table_div,filters)
                                        }
                                    }
                                }
                            }
                        } else {
                            let bs = filterData(processData(cursor.value),filters);
                            if (bs) {
                                stats.push(bs);
                                i += 1
                            }
                        }
                        cursor.continue()
                    } else {
                        if (!index.includes('date')) {
                            stats = stats.map(x => processData(x));
                            if (arena_row) {fillRow(stats,arena_row)} else {fillTable(stats,table_div,filters)}
                        } else if (stats.length < filters.limit) {
                            fillTable(stats, table_div, filters)
                        }
                    }
                }
            }
        }
    }

    function filterData(data,filters) {
        if (filters.difficulties) {
            if (!filters.difficulties.includes(data.difficulty)) {return false}
        }

        if (!filters.include_ignored) {
            if (data.ignore) { return false}
        }

        if (filters.result && !filters.result.includes(data.result)) {return false}

        if (filters.days) {
            let day = new Date(data.timestamp.replaceAll("-","/") + " GMT").getUTCDay();
            if (!filters.days.includes(day)) {return false}
        }

        if (filters.arena) { if (data.rounds !== filters.arena ) {return false} }
        if ('rob' in filters) { if (data.rob_level !== filters.rob ) {return false} }

        if (filters.isekai && !filters.isekai.includes(data.isekai)) { return false }

        return data
    }

    function processData(data) {
        if (!data.completed_rounds) {data.completed_rounds = data.rounds } //Add completed rounds if it's not there, set it as rounds

        //Add Stamina
        if (data.battle_type === 'GF') {
            data.stamina = 1 + (data.completed_rounds || data.rounds) / 50
        } else if (data.battle_type === 'Arena') {
            data.stamina = (data.completed_rounds || data.rounds) / 50
        } else if (data.battle_type === 'IW') {
            data.stamina = data.rounds / 50
        } else { //RoB and RE don't take any stamina
            data.stamina = 0
        }

        //Fix rob_level = 0 missing bug
        if (data.battle_type === 'RoB' && !('rob_level' in data)) { data.rob_level = 0 }

        if (data.isekai === undefined) {
            data.isekai = 'Persistent'
        } else if (data.isekai === true) {
            data.isekai = 'Isekai'
        }

        //Secret code to access automatically updating prices. Only needs to trigger once per page load.
        if (!document.prices_updated) {
            let bs_prices = JSON.parse(localStorage.getItem("bs_prices"));
            if (bs_prices) {
                for (let item in prices) {
                    if (item in bs_prices) {
                        //console.log(item + ': replacing ' + prices[item] + ' with ' + bs_prices[item])
                        prices[item] = bs_prices[item]
                    } else {
                        console.log("Couldn't find " + item + ": " + prices[item])
                    }
                }
                console.log("prices automatically loaded");
                console.log(prices)
            }
            document.prices_updated = true
        }

        //Add Value
        data.revenue = calculateRevenue(data);
        data.cost = calculateCost(data);
        data.profit = Math.round((data.revenue - data.cost) * 100) / 100;

        return data
    }

    function calculateRevenue(battle_stat) {
        let value = 0;
        //Add credits
        if (battle_stat.drops.Credit) {
            value += battle_stat.drops.Credit
            //console.log("Revenue: " + value + " after credits")
        }
        //Add bonus for arenas and GF
        if (battle_stat.battle_type == 'Arena') {
            if (battle_stat.rounds == 5) { value+= 20}
            if (battle_stat.rounds == 7) { value+= 200}
            if (battle_stat.rounds == 12) { value+= 400}
            if (battle_stat.rounds == 15) { value+= 600}
            if (battle_stat.rounds == 20) { value+= 800}
            if (battle_stat.rounds > 20) { value+= 1000}
        } else if (battle_stat.battle_type == 'RoB') {
            if (battle_stat.result == 'Victory') { value+=1000}
        } else if (battle_stat.battle_type == 'GF') {
            if (battle_stat.result == 'Victory') { value+= 5000}
        }
        //console.log("Revenue: " + value + " after adding GF/Arena bonus")

        //Add rest of equipment
        for (let drop in prices) {
            if (battle_stat.drops[drop]) {
                if (drop == 'Equipment') { //Add Equipment bonus
                    value += battle_stat.drops.Equipment * prices.Equipment[battle_stat.difficulty]
                    //console.log("Revenue: " +value + ". Added " + battle_stat.drops.Equipment + " Equipment at " + prices.Equipment[battle_stat.difficulty]) // Debug line
                } else {
                    value += battle_stat.drops[drop] * prices[drop]
                    //console.log("Revenue: " +value + ". Added " + battle_stat.drops[drop] + " " + drop + " at " + prices[drop]) // Debug line
                }
            }
        }
        return Math.round(value * 100) / 100
    }

    function calculateCost(battle_stat) {
        let value = 0
        //Add Stamina Cost
        value += prices.Stamina * battle_stat.stamina
        //console.log("cost: " +value + ". Added " + battle_stat.stamina + " Stamina at " + prices.Stamina) // Debug line

        //add in cost of Blood tokens for RoB level
        if (battle_stat.battle_type == 'RoB') {
            if (battle_stat.rob_level == 0) {
                value += 1 * prices.Blood
            } else if (battle_stat.rob_level < 4) {
                value += 2 * prices.Blood
            } else if (battle_stat.rob_level < 6) {
                value += 3 * prices.Blood
            } else if (battle_stat.rob_level == 6) {
                value += 5 * prices.Blood
            } else if (battle_stat.rob_level == 7) {
                value += 10 * prices.Blood
            }
            //console.log("cost: " +value + ". RoB level: " + battle_stat.rob_level +". Chaos price " + prices.Chaos) // Debug line
        }

        //Add in rest of usages
        for (let usage in prices) {
            if (battle_stat.combat.used[usage]) {
                value += battle_stat.combat.used[usage] * prices[usage]
                //console.log("cost: " +value + ". Added " + battle_stat.combat.used[usage] + " " + usage + " at " + prices[usage]) // Debug line
            }
        }

        return Math.round(value * 100) / 100
    }

    function generateAggregate(data_array,type,timestamp_name = null) { //type = Average or Total
        if (data_array.length === 0) {
            return false
        } else {
            let length = type === 'Average' ? data_array.length : 1;
            let new_data = {};
            new_data.timestamp = timestamp_name || type;
            new_data.result = data_array.map(x => x.result.split(",")).flat().filter((item, i, ar) => ar.indexOf(item) === i).join(',');
            new_data.battle_type = data_array.map(x => x.battle_type).filter((item, i, ar) => ar.indexOf(item) === i).join(',');
            new_data.rounds = Math.round(data_array.map(x => x.rounds).reduce((a,b) => a + b, 0) / length * 100) / 100;
            new_data.completed_rounds = Math.round(data_array.map(x => x.completed_rounds).reduce((a,b) => a + b, 0) / length * 100) / 100;
            new_data.difficulty = data_array.map(x => x.difficulty.split(",")).flat().filter((item, i, ar) => ar.indexOf(item) === i).join(',');
            new_data.fighting_style = data_array.map(x => x.fighting_style.split(",")).flat().filter((item, i, ar) => ar.indexOf(item) === i).join(',');
            new_data.persona = data_array.map(x => x.persona.split(",")).flat().filter((item, i, ar) => ar.indexOf(item) === i).join(',');
            new_data.equip_set = data_array.map(x => x.equip_set).flat().filter((item, i, ar) => ar.indexOf(item) === i)
            let uniq_isekai = data_array.map(x => x.isekai).filter((item, i, ar) => ar.indexOf(item) === i)
            new_data.isekai = uniq_isekai.length > 1 ? 'Both' : uniq_isekai[0]

            if (typeof data_array[0].level == 'string') {
                data_array.level = data_array.map(x => x.level.split(" - ")).flat().map(x => parseInt(x));
            } else {
                data_array.level = data_array.map(x => x.level)
            }
            new_data.level = type === 'Average' ? Math.round(data_array.level.reduce((a, b) => a + b) / data_array.level.length * 10) / 10 : Math.min.apply(null,  data_array.level) + " - " + Math.max.apply(null, data_array.level);

            let combat = {};
            let drops = {'Equips': {}};
            let proficiency = {};
            for (let i = 0; i < data_array.length;i++) {
                for (let sub_combat in data_array[i].combat) {
                    combat[sub_combat] = combat[sub_combat] || {}
                    for (let key in data_array[i].combat[sub_combat]) {
                        combat[sub_combat][key] = (combat[sub_combat][key] || 0) + data_array[i].combat[sub_combat][key]
                    }
                }
                let data_drops = Object.entries(data_array[i].drops);
                for (let j = 0; j < data_drops.length; j++) {
                    if (typeof data_drops[j][1] == 'number') {
                        drops[data_drops[j][0]] = (drops[data_drops[j][0]] || 0) + (data_drops[j][1] || 0)
                    } else { //Basically Equips
                        for (let equip in data_drops[j][1]) {
                            drops[data_drops[j][0]][equip] = (drops[data_drops[j][0]][equip] || 0) + data_drops[j][1][equip]
                        }
                    }
                }
                for (let key in data_array[i].proficiency) {
                    if (data_array[i].proficiency.hasOwnProperty(key)) {
                        proficiency[key] = parseFloat(((proficiency[key] || 0) + data_array[i].proficiency[key]).toFixed(8))
                    }
                }
            }

            if (type === 'Average') {
                for (let sub_combat in combat) {
                    for (let key in combat[sub_combat]) {
                        if (combat[sub_combat].hasOwnProperty(key)) { combat[sub_combat][key] = Math.round(combat[sub_combat][key] / length * 10) / 10 }
                    }
                }
                for (let key in drops) {
                    if (drops.hasOwnProperty(key)) {
                        drops[key] = Math.round(drops[key] / length * 100) / 100
                    }
                }
                for (let key in proficiency) {
                    if (proficiency.hasOwnProperty(key)) { proficiency[key] = Math.round(proficiency[key] / length * 100000) / 100000 }
                }
            }
            new_data.combat = combat;
            new_data.drops = drops;
            if (Object.entries(proficiency).length > 0 ) { new_data.proficiency = proficiency }

            let total_turns = data_array.map(x => x.turns).reduce((a,b) => a + b, 0);
            let total_seconds = data_array.map(x => x.seconds).reduce((a,b) => a + b, 0);
            new_data.turns = type === 'Average' ? (Math.round(total_turns / length * 100) / 100) : total_turns;
            new_data.seconds = type === 'Average' ? (Math.round(total_seconds / length * 100) / 100) : Math.round(total_seconds * 100) / 100;

            new_data.stamina = Math.round(data_array.map(x => x.stamina).reduce((a,b) => a + b, 0) / length * 100) / 100;
            new_data.revenue = Math.round(data_array.map(x => x.revenue).reduce((a,b) => a + b, 0) / length * 10) / 10;
            new_data.cost = Math.round(data_array.map(x => x.cost).reduce((a,b) => a + b, 0) / length * 10) / 10;
            new_data.profit = Math.round(data_array.map(x => x.profit).reduce((a,b) => a + b, 0) / length * 10) / 10;

            new_data.agg = true;

            //Skipped Fields: Date, rob_level, iw_result,log, ignore

            return new_data
        }
    }

    function generateExtrema(data_array, type) {
        let extrema = {};
        if (type === 'Max') {
            extrema = data_array.reduce(getRecursiveMax,extrema)
        } else {
            extrema =  data_array.reduce(getRecursiveMin,extrema)
        }
        extrema.timestamp = type;

        extrema.agg = true;

        return extrema
    }

    function getRecursiveMin(a,b,index) {
        for (let key in b) {
            if (key === 'Equips') {
                //Do nothing.
            } else if (typeof b[key] === 'number') {
                a[key] = a[key] === undefined ? (index === 0 ? b[key] : 0) : (a[key] > b[key] ? b[key] : a[key]);
            } else if (typeof b[key] === 'object') {
                a[key] = getRecursiveMin(a[key] || {}, b[key],index)
            } else if (typeof b[key] === 'string') {
                if (key === 'level') {
                    let min = Math.min.apply(null,b[key].split(" - "));
                    a[key] = (a[key] === undefined || a[key] > min) ? min : a[key]
                } else {
                    a[key] = ""
                }
            }
        }
        return a
    }

    function getRecursiveMax(a,b) {
        for (let key in b) {
            if (key === 'Equips') {
                //Do nothing.
            } else if (typeof b[key] === 'number') {
                a[key] = (a[key] === undefined || a[key] < b[key]) ? b[key] : a[key]
            } else if (typeof b[key] === 'object') {
                a[key] = getRecursiveMax(a[key] || {}, b[key])
            } else if (typeof b[key] === 'string') {
                if (key === 'level') {
                    let max = Math.max.apply(null,b[key].split(" - "));
                    a[key] = (a[key] === undefined || a[key] < max) ? max : a[key]
                } else {
                    a[key] = ""
                }
            }
        }
        return a
    }

    //----------------------------------------------------------------------------------------------------------------------
    //-------------UI
    //----------------------------------------------------------------------------------------------------------------------
    function addPageUI() {
        let url = window.location.href;
        if (url.includes("hentaiverse.org/battle_stats") || url.includes("hentaiverse.org/isekai/battle_stats")) {
            console.log('Loading UI');
            document.title = "HV Battle Stats";
            addSharedCSS();
            addPageCSS();
            addTableCSS();

            let newBody = document.createElement("div");
            newBody.id = 'hbs-main';

            document.body.replaceChildren(newBody);

            //Add Menu Items
            let menu = generateMenuItems('hbs-menu');
            newBody.appendChild(menu);

            //Add filter Options
            let filters = createFilters();
            newBody.append(filters);

            //Add Table Holder
            let tableParent = getTableParent();
            newBody.appendChild(tableParent);

            addUIListeners()
        }
    }

    function addMenuIntegration(parent_name='hvut-top') {
        let nav_bar = document.getElementById(parent_name);
        if (nav_bar) { //If the nav bar is present, add battlestats to it
            //Add CSS to document
            addSharedCSS();
            addMenuCSS();
            addTableCSS();

            //Create Menu
            let bs_menu = document.createElement('div');
            bs_menu.classList.add('hbs_menu');
            let title_span = document.createElement('span');
            title_span.innerText = 'BS';
            let menu_list = generateMenuItems('hvut-top-sub',true);

            bs_menu.appendChild(title_span);
            bs_menu.appendChild(menu_list);

            //Add to document.
            if (nav_bar) { nav_bar.appendChild(bs_menu) }

            addUIListeners();

            //Add popup div
            let container = getMainContainer();
            document.getElementById('mainpane').appendChild(container);

            //Process Arena and RoB pages
            if (document.URL.includes('?s=Battle&ss=ar')) {
                modifyArenaRows('Arena')
            }  else if (document.URL.includes('?s=Battle&ss=rb')) {
                modifyArenaRows('RoB')
            }

            console.log("Loaded Battle Stats Menu Integration")
        }
    }

    function modifyArenaRows(type) {
        let challenges = Array.from(document.getElementById('arena_list').rows);
        challenges[0].children[1].innerText = 'Avg. Turns';
        challenges[0].children[2].innerText = 'Avg. Value/Round';
        challenges[0].children[4].innerText = 'Avg. Time';

        for (let i=1;i<challenges.length;i++) {
            let filters = {'limit': default_rows};
            if (type === 'Arena') {
                filters['arena'] = parseInt(challenges[i].children[3].innerText);
            } else {
                filters['rob'] = i-1;
            }
            addData('battle_type,timestamp',[type,0],[type,'z'],null,filters,challenges[i])
        }

        if (type === 'Arena') {
            let observer = new MutationObserver(function(mutations) {
                for(let mutation of mutations) {
                    let rows = mutation.addedNodes;
                    for (let i=0;i<rows.length; i++) {
                        if (rows[i].tagName === 'TR') {
                            let rounds = parseInt(rows[i].children[3].innerText);
                            let filters = {'limit': default_rows, 'arena': rounds};
                            addData('battle_type,timestamp',[type,0],[type,'z'],null,filters,rows[i])
                        }
                    }
                }
            });

            observer.observe(document.getElementById("arena_list").children[0], {
                childList: true
            });
        }

    }

    function generateMenuItems(className,menu_integration=false) {
        let menu_list = document.createElement('div');
        menu_list.classList.add(className);

        let ul = document.createElement('ul');
        menu_list.appendChild(ul);

        let items = ['All','Arena','Ring of Blood','GrindFest','Item World','RE'];
        for (let i = 0; i < items.length; i++) {
            let li = document.createElement('li');
            let link = document.createElement('a');
            link.classList.add('hbs-list-table-link');
            link.href = '#';
            link.innerText = items[i];
            link.dataset.type = items[i];
            if (menu_integration) {link.dataset.menu = 'True'}
            li.appendChild(link);
            ul.appendChild(li);
        }

        let divider_span = document.createElement('span');
        divider_span.classList.add('hbs-menu-divider');
        ul.append(divider_span);

        let li = document.createElement('li');
        li.appendChild(importDataLink());
        ul.appendChild(li);

        li = document.createElement('li');
        li.appendChild(exportDataLink());
        ul.appendChild(li);

        li = document.createElement('li');
        li.appendChild(deleteDataBaseLink());
        ul.appendChild(li);

        divider_span = document.createElement('span');
        divider_span.classList.add('hbs-menu-divider');
        ul.append(divider_span);

        li = document.createElement('li');
        let link = document.createElement('a');
        link.href = menu_integration ? "battle_stats" : "/";
        link.innerText = menu_integration ?'Separate Page' : "Back to HV";
        li.appendChild(link);
        ul.appendChild(li);

        return menu_list
    }

    function getMainContainer(show=false) {
        let container = document.getElementById('hbs_container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hbs_container';
            let filters = createFilters();
            container.append(filters);
            let tableParent = getTableParent();
            container.appendChild(tableParent);

            let exit = document.createElement('button');
            exit.classList.add('hbs-exit');
            exit.innerText='Close';
            exit.addEventListener("click", function() { getMainContainer(false) });

            container.appendChild((exit));
        }

        if (show) {container.classList.add('hbs_visible')} else {container.classList.remove('hbs_visible')}
        return container
    }

    function importDataLink() {
        let fileSelector = document.createElement('input');
        fileSelector.setAttribute('type', 'file');
        fileSelector.id = 'hbs_upload';

        fileSelector.addEventListener('change', function() {
            if (fileSelector.files[0]) {
                let reader = new FileReader();
                reader.addEventListener('load', function(event) {
                    console.log('loading data!');
                    importDB(event.target.result);
                });
                reader.readAsBinaryString(fileSelector.files[0]);
            }
        });

        let selectLink = document.createElement('a');
        selectLink.setAttribute('href', '');
        selectLink.innerText = "Import Data";
        selectLink.href = '#';
        selectLink.onclick = function () {
            fileSelector.click();
            return false;
        };

        return selectLink
    }

    function exportDataLink() {
        let selectLink = document.createElement('a');
        selectLink.setAttribute('href', '');
        selectLink.innerText = "Export Data";
        selectLink.href = '#';
        selectLink.onclick = function () {
            exportDB();
            return false;
        };
        return selectLink
    }

    function deleteDataBaseLink() {
        let selectLink = document.createElement('a');
        selectLink.setAttribute('href', '');
        selectLink.innerText = "Delete Database";
        selectLink.href = '#';
        selectLink.onclick = function () {
            deleteDB();
            return false;
        };
        return selectLink
    }

    function addUIListeners() {
        document.addEventListener("click", function(event) {
            if (event.target.classList.contains("hbs-list-table-link")) { //Load a table
                event.preventDefault();
                current_selection = event.target.dataset.type;
                if (event.target.dataset.menu) {
                    let container = getMainContainer(true);
                    document.getElementById('mainpane').appendChild(container);
                }
                renderFilters();
                startQuery();
            }
        });
    }

    function startQuery(type = current_selection) {
        if (type) {
            let tableParent = getTableParent(type); //Generate/Get Table
            let existing_tables = tableParent.getElementsByClassName('hbs-table');
            if (existing_tables) {Array.from(existing_tables).map(x => tableParent.removeChild(x))}

            let table = generateTable();
            tableParent.appendChild(table);

            //Get current filters
            let filters = getFilters();

            let index, battle_type, lower_bound, upper_bound;

            if (type === 'All') {
                index = filters.aggregate ? 'date' : 'default';
                lower_bound = 0;
                upper_bound = 'z'
            } else {
                index = filters.aggregate ? 'battle_type,date' : 'battle_type,timestamp';
                if (type === 'Arena') {
                    battle_type = 'Arena';
                } else if (type === 'Ring of Blood') {
                    battle_type = 'RoB'
                } else if (type === 'GrindFest') {
                    battle_type = 'GF'
                } else if (type === 'Item World') {
                    battle_type = 'IW'
                } else if (type === 'RE') {
                    battle_type = 'RE'
                }
                lower_bound = [battle_type,0];
                upper_bound = [battle_type,'z']
            }

            addData(index,lower_bound,upper_bound,table,filters)
        }
    }

    //----------------------------------------------------------------------------------------------------------------------
    //-------------Table Generation
    //----------------------------------------------------------------------------------------------------------------------
    function getTableParent(title='') {
        let parent = document.getElementById('hbs_table_parent');
        if (!parent) {
            parent = document.createElement("div");
            parent.id = 'hbs_table_parent';
            parent.classList.add("hbs-table-holder");

            let title_div = document.createElement('div');
            title_div.classList.add('hbs-table-title');
            parent.appendChild(title_div);

            let querying_span = document.createElement('span');
            querying_span.id = 'hbs_query_span';
            querying_span.innerText = 'Querying';
            parent.appendChild(querying_span);

        }
        if (title) {parent.children[0].innerText = title}

        return parent
    }

    function generateTable() {
        let table = document.createElement("table");
        table.classList.add("hbs-table");
        table.id = 'table-id-' + String(Date.now());

        return table
    }

    function fillTable(stats,table) {
        let columns = getColumns();
        table = document.getElementById(table.id);
        if (stats.length < 1) {
            table.innerText = 'No Results. Fight some battles or adjust the filters.'
        } else if (table) {
            let table_header = table.createTHead();
            //Add Grouping Row (groups headers)
            let grouping_row = table_header.insertRow(-1);
            grouping_row.classList.add('grouping_row');
            for (let i = 0; i< Object.keys(table_columns).length; i++) {
                let length = table_columns[Object.keys(table_columns)[i]].length;
                if (length > 0) {
                    let grouping_header = document.createElement("th");
                    grouping_header.colSpan = length;
                    grouping_header.innerText = Object.keys(table_columns)[i];
                    grouping_row.append(grouping_header);
                }
            }

            //Add Header Row
            let header_row = table_header.insertRow(-1);
            header_row.classList.add('header_row');
            for (let i = 0; i < columns.length;i++) {
                let table_header = document.createElement("th");
                table_header.innerText = columns[i].column_name;
                header_row.append(table_header);
            }

            let tbody = table.createTBody();
            for (let i = 0; i < stats.length; i++) {
                if (stats[i]) {
                    let row = generateRow(tbody,-1,stats[i]);
                    row.classList.add('stats_row')
                }
            }

            for (let i=stat_rows.length; i>= 0 ;i--) {
                if (['Average','Total','Max','Min'].includes(stat_rows[i])) {
                    let stat_data = ['Min','Max'].includes(stat_rows[i]) ? generateExtrema(stats,stat_rows[i]) : generateAggregate(stats,stat_rows[i]);
                    let row = generateRow(table_header,2,stat_data);
                    row.classList.add('agg_row');
                    if (i === stat_rows.length - 1) {row.classList.add('last_agg_row')}
                }
            }
        }
        getTableParent().children[1].classList.remove('hbs-querying')
    }

    function fillRow(stats,row) {
        let avg = generateAggregate(stats,'Average');
        row.children[1].innerText = (avg.turns).toFixed(2); //Average number of turns
        row.children[2].innerText = (avg.profit / avg.rounds).toFixed(2); //Average
        row.children[4].innerText = getTimeString(avg.seconds) //Average time
    }


    function generateRow(table,position,data) {
        let columns = getColumns();
        //TODO columns = get_columns function (could use current_selection to determine which one)
        let row = table.insertRow(position);
        for (let j=0; j<columns.length; j++) {
            let table_cell = row.insertCell(-1);
            let cell_content = "Invalid format";
            if ('field' in columns[j]) {
                cell_content = data[columns[j].field]
            } else if ('numerator' in columns[j]) {
                cell_content = (data[columns[j].numerator] / data[columns[j].denominator]).toFixed(2)
            } else if ('drops' in columns[j]) {
                cell_content = data.drops[columns[j].drops] || 0
            } else if ('usage' in columns[j]) {
                cell_content = String(Math.round( (data.combat.used[columns[j].usage] || 0 ) * 100) / 100)
            } else if ('difference' in columns[j]) {
                let value = Math.round(((data.drops[columns[j].difference] || 0) - (data.combat.used[columns[j].difference] || 0 )) * 100) / 100;
                cell_content = (value > 0 ? "+" : '') + value
            } else if ('sum_usage' in columns[j]) {
                let value = 0;
                for (let i=0; i<columns[j].sum_usage.length;i++) {
                    value += data.combat.used[columns[j].sum_usage[i]] || 0
                }
                cell_content = String(Math.round(value * 100) / 100)
            } else if ('sum_drops' in columns[j]) {
                let value = 0;
                for (let i=0; i<columns[j].sum_drops.length;i++) {
                    value += data.drops[columns[j].sum_drops[i]] || 0
                }
                cell_content = String(Math.round(value * 100) / 100)
            } else if ('sum_difference' in columns[j]) {
                let value = 0;
                for (let i = 0; i < columns[j].sum_difference.length; i++) {
                    value += (data.drops[columns[j].sum_difference[i]] || 0) - (data.combat.used[columns[j].sum_difference[i]] || 0)
                }
                cell_content = (value > 0 ? "+" : '') + (Math.round(value * 100) / 100)
            } else if ('presence' in columns[j]) {
                cell_content = columns[j].presence in data ? "True" : "False"
            } else {
                console.log('Invalid Format',columns[j]);
            }
            if ('bins' in columns[j]) {
                for (let bin_value in columns[j].bins) {
                    if (parseFloat(cell_content) > bin_value){
                        table_cell.style.cssText = columns[j].bins[bin_value]
                    }
                }
            }
            if ('format' in columns[j]) {
                if (columns[j].format === 'time_string') {
                    cell_content = getTimeString(cell_content)
                }
            }
            table_cell.innerText = cell_content;
            if ('tooltip' in columns[j]) {addTooltip(table_cell,data,columns[j]) }
        }
        row.data = data;
        return row;
    }

    function addTooltip(cell,data,col) { // This is admittedly pretty bad code.
        let holder = [];
        if (col.tooltip === 'Equips') {
            for (let key in data.drops.Equips) {
                if (key.includes(col.keyword)) { holder.push(key + ': ' + data.drops.Equips[key]) }
            }
        } else if (col.tooltip === 'proficiency') {
            for (let key in data[col.tooltip]) {
                holder.push(key + ": " + data[col.tooltip][key])
            }
        } else if (col.tooltip === 'equipped') {
            for (let i=0;i<data.equip_set.length;i++) {
                holder.push(data.equip_set[i].replace(',','/'))
            }
        } else if (col.tooltip === 'sum_usage') {
            for (let i=0;i<col.sum_usage.length;i++) {
                if (col.sum_usage[i] in data.combat.used) {
                    holder.push(col.sum_usage[i] + ": " + data.combat.used[col.sum_usage[i]])
                }
            }
        } else if (col.tooltip === 'sum_drops') {
            for (let i=0;i<col.sum_drops.length;i++) {
                if (col.sum_drops[i] in data.drops) {
                    holder.push(col.sum_drops[i] + ": " + data.drops[col.sum_drops[i]])
                }
            }
        } else if (col.tooltip === 'sum_difference') {
            for (let i=0;i<col.sum_difference.length;i++) {
                let count = 0;
                if (col.sum_difference[i] in data.drops) { count += data.drops[col.sum_difference[i]] }
                if (col.sum_difference[i] in data.combat.used) { count -= data.combat.used[col.sum_difference[i]] }
                holder.push(col.sum_difference[i] + ": " + count)
            }
        } else if (col.tooltip === 'ignore_button') {
            holder.push('ignore_button')
        } else if (col.tooltip === 'defeat' && data.result == 'Defeat' ) {
            holder.push(data.log.replace(/\./g,".<br>"))
        }

        if (holder.length === 0) { return }

        let tooltip = document.createElement('span');
        tooltip.classList.add('hbs-tooltip');
        for (let i=0; i < holder.length;i++) {
            let line = document.createElement('div');
            if (holder[i] === 'ignore_button') {
                if (data.agg) {return line}
                let checked = data.ignore ? true : false;
                let checkbox = createCheckBox('Ignore this entry',false,true,checked,false);
                checkbox.classList.add('hbs_ignore_checkbox');
                checkbox.addEventListener('change',function() {ignoreBattleStat(this)});
                line.append(checkbox)
            } else {
                if (col.tooltip === 'equipped') {
                    let equip_link = document.createElement('a');
                    equip_link.href = 'equip/' + holder[i];
                    equip_link.innerText = holder[i];
                    line.append(equip_link)
                } else {
                    line.innerHTML = holder[i];
                    if (col.tooltip === 'defeat' ) {line.style.textAlign = 'left'}
                }
            }
            tooltip.appendChild(line)
        }
        let tooltip_parent = document.createElement('span');
        while (cell.childNodes.length) { tooltip_parent.appendChild(cell.firstChild) } //Moves the cell's contents to the tooltip parent
        tooltip_parent.append(tooltip);
        tooltip_parent.classList.add('hbs-tooltip-parent');
        cell.appendChild(tooltip_parent);
    }

    function getColumns() {
        //Secret code to access automatically updating columns. Only needs to trigger once per page load.
        if (!document.hbs_columns) {
            let bs_columns = JSON.parse(localStorage.getItem("bs_columns"));
            if (bs_columns) {table_columns = bs_columns;}
            document.hbs_columns = true
        }

        return Object.values(table_columns).flat();
    }

    function getTimeString(time) { //Gets ms
        if (!time) { return 'NA' }
        let hours = Math.floor(time / 3600),
            minutes = Math.floor(time / 60) % 60,
            seconds = Math.floor(time % 60),
            ms = time.toString().split('.')[1] || '00';
        return (hours > 0 ? hours + ':' : '') +
            (minutes < 10 && hours > 0 ? '0' : '') + minutes +
            (seconds < 10 ? ':0' : ':') + seconds +
            (ms.length < 2 ? '.0' : '.') + ms
    }

    function ignoreBattleStat(label_div) {
        let checked = label_div.children[0].checked;
        let data = label_div.parentNode.parentNode.parentNode.parentNode.parentNode.data;
        let new_stat = new BattleStats(data);
        new_stat.ignore = checked;
        new_stat.saveToDB()
    }
    //----------------------------------------------------------------------------------------------------------------------
    //-------------Filters
    //----------------------------------------------------------------------------------------------------------------------
    function getFilters() {
        let filters = {};
        filters.aggregate = document.getElementById('hbs_filter_aggregate').children[0].children[0].checked;
        filters.include_ignored = document.getElementById('hbs_filter_manual').children[0].children[0].checked;
        filters.limit = parseInt(document.getElementById('hbs_filter_rows').children[0].value) || 1;
        filters.difficulties =  Array.from(document.getElementById('hbs_filter_difficulties').querySelectorAll('input:checked')).map(x => x.value);
        filters.result = Array.from(document.getElementById('hbs_filter_result').querySelectorAll('input:checked')).map(x => x.value);
        filters.isekai =  Array.from(document.getElementById('hbs_filter_isekai').querySelectorAll('input:checked')).map(x => x.value);
        let days =  Array.from(document.getElementById('hbs_filter_days').querySelectorAll('input:checked')).map(x => x.value);
        let day_mapping = {'Monday' : 1, 'Tuesday': 2,'Wednesday': 3,'Thursday': 4,'Friday': 5,'Saturday': 6,'Sunday': 0};
        filters.days = days.map(x => day_mapping[x]);

        let arenas = document.getElementById('hbs_filter_arena');
        if (arenas && !arenas.classList.contains('hbs_hide') && arenas.children[0].value !== 'All') {
            filters.arena = parseInt(arenas.children[0].value)
        }

        let rob = document.getElementById('hbs_filter_rob');
        if (rob && !rob.classList.contains('hbs_hide') && rob.children[0].value !== 'All') {
            filters.rob = parseInt(rob.children[0].value)
        }

        console.log(filters);

        return filters
    }

    function createFilters() {
        let filter_div = document.getElementById('hbs_filters');
        if (!filter_div) {
            filter_div = document.createElement('div');
            filter_div.id = 'hbs_filters';

            // Day Aggregation
            filter_div.append(createCheckBoxes(['Aggregate by Day'],'hbs_filter_aggregate',aggregate_by_day));
            filter_div.append(createCheckBoxes(['Include Manually Ignored'],'hbs_filter_manual',include_manually_ignored_stats));
            filter_div.append(createCheckBoxes(['Persistent','Isekai'],'hbs_filter_isekai',default_isekai));
            filter_div.append(createInput('hbs_filter_rows',default_rows));
            filter_div.append(createCheckBoxes(['PFUDOR', 'IWBTH','Nintendo','Hell','Nightmare','Hard','Normal'],'hbs_filter_difficulties',default_difficulties));
            filter_div.append(createCheckBoxes(['Victory','Defeat','Flee'],'hbs_filter_result',default_results));
            filter_div.append(createCheckBoxes(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],'hbs_filter_days',default_days));

            let arena_select = createSelect("hbs_filter_arena",[
                ['All','All'],
                ['First Blood (5)',5],['Learning Curves (7)',7],['Graduation (12)',12],
                ['Road Less Traveled (15)',15],['A Rolling Stone (20)',20],['Fresh Meat (25)',25],
                ['Dark Skies (30)',30],['Growing Storm (35)',35],['Power Flux (40)',40],
                ['Killzone (45)',45],['Endgame (50)',50],['Longest Journey (55)',55],
                ['Dreamfall (60)',60],['Exile (65)',65],['Sealed Power (70)',70],
                ['New Wings (75)',75],['To Kill A God (80)',80],['Eve of Death (90)',90],
                ['The Trio and the Tree (100)',100],['End of Days (110)',110],['Eternal Darkness (125)',125],
                ['A Dance with Dragons (150)',150]
            ]);
            arena_select.classList.add('hbs_hide');
            filter_div.append(arena_select);

            let rob_select = createSelect("hbs_filter_rob", [
                ['All','All'],
                ['Konata',0],['Mikuru Asahina',1],['Ryouko Asakura',2],
                ['Yuki Nagato',3],['Real Life',4],['Invisible Pink Unicorn',5],
                ['Flying Spaghetti Monster',6],['Triple Trio And The Tree',7]
            ]);
            rob_select.classList.add('hbs_hide');
            filter_div.append(rob_select);
        }

        return filter_div
    }

    function renderFilters() {
        if (current_selection === 'Arena') {
            document.getElementById('hbs_filter_arena').classList.remove('hbs_hide')
        } else {
            document.getElementById('hbs_filter_arena').classList.add('hbs_hide')
        }
        if (current_selection === 'Ring of Blood') {
            document.getElementById('hbs_filter_rob').classList.remove('hbs_hide')
        } else {
            document.getElementById('hbs_filter_rob').classList.add('hbs_hide')
        }
    }

    function createInput(id,default_value) {
        let parent = createFilterParent(id);
        let input = document.createElement("input" );
        input.addEventListener('change', function() {startQuery()});
        input.type = "number";
        input.value = default_value;
        input.min = "0";
        input.step = "1";
        parent.append(input);
        return parent
    }

    function createSelect(id,values) {
        let parent = createFilterParent(id);
        let select = document.createElement("select" );
        select.addEventListener('change', function() {startQuery()});
        for (let i=0; i<values.length;i++) {
            let option = document.createElement("option");
            option.text = values[i][0];
            option.value = values[i][1];
            select.appendChild(option)
        }
        parent.append(select);
        return parent
    }

    function createCheckBoxes(text_array,id,defaults) {
        let parent = createFilterParent(id);
        for (let i=0;i<text_array.length;i++) {
            let checked = true;
            if (typeof(defaults) === 'boolean') {
                checked = defaults
            } else if (typeof(defaults) === 'object') {
                checked = defaults.includes(text_array[i])
            }
            let checkbox = createCheckBox(text_array[i],false,text_array[i],checked);
            checkbox.classList.add('hbs_filter_checkbox');
            parent.append(checkbox)
        }
        return parent
    }

    function createCheckBox(text,id=false,value='',defaultChecked=true,filter=true) {
        let option = document.createElement("label");
        let checkbox = document.createElement("input");
        checkbox.setAttribute("type","checkbox");
        if (filter) {checkbox.addEventListener('change', function() {startQuery()})}
        checkbox.defaultChecked = defaultChecked;
        if (id) {checkbox.id = 'hbs_filter_aggregate';}
        if (value) {checkbox.value = value;}
        option.append(checkbox);
        option.append(text);
        return option
    }

    function createFilterParent(id) {
        let parent =  document.createElement("div");
        parent.classList.add('hbs_filter');
        parent.id = id;
        return parent
    }

    //----------------------------------------------------------------------------------------------------------------------
    //-------------DB Functions
    //----------------------------------------------------------------------------------------------------------------------
    function createDB() {
        let request = self.indexedDB.open('Battle Stats', 1);
        request.onsuccess = function() {
            console.log("Successfully opened DB")
        };
        request.onerror = function() {
            console.log('[onerror]', request.error);
        };
        request.onupgradeneeded = function(event) {
            let db = event.target.result;

            let battles = db.createObjectStore('battles', {keyPath: 'timestamp'});
            //Where x = num of rows
            battles.createIndex("battle_type,date",['battle_type','date']); //Used to get last x entries of a
            battles.createIndex("date,battle_type",['date','battle_type']); //Used to get daily data of last x days of y battle_type
            battles.createIndex('date','date'); //Used to get last x days of all runs
            battles.createIndex('battle_type,timestamp',['battle_type','timestamp']) //Used to get last x (honestly this is just to keep code down
        };
    }

    function addStorageChangeListener() {
        window.addEventListener('battleEnd', function(e) {
            if( !document.hidden) { //Tab is active
                console.log('Detected battleEnd Event!');
                let victory_pane = document.getElementById("btcp");
                if (victory_pane) {
                    if (victory_pane.innerText.includes("turns")) { //turns is added by monsterbation always.
                        console.log('All Finished, adding stats to IndexedDB');
                        let battle_stats = new BattleStats(false,e.detail);
                        battle_stats.saveToDB()
                    }
                }
            }
        })
    }

    function exportDB(limit=export_limit) {
        let count = -1; //Only get the most recent up to limit (default = 1000)
        let holder = [];
        let date = '';
        let request = self.indexedDB.open('Battle Stats');
        request.onsuccess = function(event) {
            let os_req = event.target.result.transaction('battles', "readwrite").objectStore("battles").index('date').openCursor(null,'prev');
            os_req.onsuccess = function(e) {
                let cursor = e.target.result;
                if (cursor) {
                    let current_date = cursor.key.substring(0,export_type === 'all' ? 0 : (export_type === 'month' ? 7 : 4));
                    if (current_date === date) {
                        holder.push(cursor.value)
                    } else {
                        downloadJSON(holder,date);
                        holder = [cursor.value];
                        date = current_date;
                        count += 1;
                    }
                    if (count < limit) {
                        cursor.continue()
                    }
                } else {
                    downloadJSON(holder,date)
                }
            }
        }
    }

    function downloadJSON(holder,date) {
        if (holder.length > 0) {
            let blob = new Blob([JSON.stringify(holder)], {type: "application/json"});
            let download_link = document.createElement("a");
            download_link.download = "Battle_Stats_Dump"+ (date ? "_" + date : "") +'.json';
            download_link.href = window.URL.createObjectURL(blob);
            download_link.click();
        }
    }

    function importDB(data_string) {//Does not erase existing data. Just adds new data. If keys overlap, new ones will overwrite it.
        let data = JSON.parse(data_string);
        for (let i = 0; i < data.length; i++) {
            let battle_stat = new BattleStats(data[i]);
            //Convert time_taken to seconds
            if (!battle_stat.seconds) {
                if (battle_stat.time_taken) {
                    let time_array = battle_stat.time_taken.split(":").map(x => parseInt(x));
                    battle_stat.seconds = time_array[0] * 3600 + time_array[1] * 60 + time_array[2] //Works with string
                }
            }

            battle_stat.saveToDB();
        }
    }

    function deleteDB() {
        let answer = confirm("WARNING! Please make a backup first with Export Data.\nAre you sure you want to delete the database?");
        if (answer) {
            let request = self.indexedDB.deleteDatabase('Battle Stats');
            request.onsuccess = function() {
                console.log('Successfully deleted DB. Recreating DB Stores.');
                createDB()
            }
        }
    }

    //----------------------------------------------------------------------------------------------------------------------
    //-------------CSS Style Functions
    //----------------------------------------------------------------------------------------------------------------------
    function addPageCSS() {
        GM_addStyle('body {background: #E3E0D1; font-size: 10pt;}');
        GM_addStyle('#hbs-main {margin: auto;text-align: center;}');
        GM_addStyle('.hbs-menu ul li {display: inline; padding: 5px;}');
        GM_addStyle('.hbs-menu ul hr {border-top: 3px dotted; height: 2px;}');
        GM_addStyle('.hbs-table {font-size: 10pt}');
        GM_addStyle('.hbs-menu-divider {border-right: 2px solid;}')
    }

    function addMenuCSS() {
        //Container
        GM_addStyle('#hbs_container {position: absolute; visibility: hidden; top: 5%; left:3%; width: 90%; height: 90%; overflow-y: auto; background-color: #E3E0D1; color: black; text-align: center; padding: 10px 30px 10px 30px; border-radius: 6px; font-size: 8pt;}');
        GM_addStyle('.hbs-exit {position: absolute; top: 10px; left: 10px;}');
        GM_addStyle('.hbs-table {font-size: 8pt}');

        //Menu Item Styling
        GM_addStyle('.hbs_menu ul {list-style: none; padding: 0; line-height: 18px;}');
        GM_addStyle('.hbs_menu a {margin: 5px 0; padding: 0 5px;}');
        GM_addStyle('.hbs-menu-divider {display: block; width: 100%; border-bottom: 2px solid;}')
    }

    function addSharedCSS() {
        GM_addStyle('.hbs_hide {display: none;}');
        GM_addStyle('.hbs_visible {visibility: visible!important;z-index: 9}');
    }

    function addTableCSS() {
        //Table Styling
        GM_addStyle('.hbs-table-title {font-size: 20pt;}');
        GM_addStyle('.hbs-table {margin-left: auto; margin-right: auto; white-space: nowrap;text-align: center}');
        GM_addStyle('.hbs-table td, table.hbs_table th {padding: 0px 5px 0 5px}');
        GM_addStyle('.hbs-table tr.grouping_row th {border-left: 1px solid black; border-right: 1px solid black;}');
        GM_addStyle('.last_agg_row td { border-bottom: 1px solid #000; }');

        //Querying Span
        GM_addStyle('#hbs_query_span {display: none}');
        GM_addStyle("#hbs_query_span[class='hbs-querying'] {display: unset; font-size: 16pt;}");

        //Tooltip
        GM_addStyle('.hbs-tooltip-parent {position: relative; border-bottom: 1px dashed black;}');
        GM_addStyle('.hbs-tooltip-parent:hover {background: #d9d6ca}');
        GM_addStyle('.hbs-tooltip-parent:hover .hbs-tooltip {visibility: visible; z-index: 10;}');
        GM_addStyle('.hbs-tooltip {visibility: hidden; position: absolute; background: #d9d6ca; top: -10px; left: 100%; padding: 5px; border: 1px solid black; border-radius: 6px;}');
    }

    function GM_addStyle(css) {
        const style = document.getElementById("GM_addStyleBy8626") || (function() {
            const style = document.createElement('style');
            style.type = 'text/css';
            style.id = "GM_addStyleBy8626";
            document.head.appendChild(style);
            return style;
        })();
        const sheet = style.sheet;
        sheet.insertRule(css, (sheet.rules || sheet.cssRules || []).length);
    }

    //----------------------------------------------------------------------------------------------------------------------
    //-------------Execution
    //----------------------------------------------------------------------------------------------------------------------
    //Creating DB
    createDB();

    //Add Event Listeners
    addStorageChangeListener();

    //Add a single global variables
    let current_selection = '';

    //Perform UI adjustments
    addPageUI();
    addMenuIntegration();

})();