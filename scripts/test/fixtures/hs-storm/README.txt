TEST FIXTURES, NOT REAL WEATHER. Recorded-format samples for scripts/test/home-shield-partners-tests.mjs
and home-shield-partners-browser.mjs: nws-alerts-FL.json follows api.weather.gov /alerts/active GeoJSON;
spc-today.csv / spc-yesterday.csv follow www.spc.noaa.gov/climo/reports/*_filtered.csv (tornado, wind and
hail blocks, each with its own header). Places, times and values are invented for tests.
nws-point-*.json follow api.weather.gov /alerts/active?point= ; census-*.json follow the US Census
geocoder onelineaddress JSON (one match / no match). "123 Main St" is an invented test address.
