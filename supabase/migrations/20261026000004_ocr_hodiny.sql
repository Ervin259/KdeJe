-- KdeJe – OČR sa dá zapísať aj na hodiny (všetky firmy aj predloha pre nové firmy)
update absence_types          set parts = array['full','half','hrs'] where code = 'OČR';
update absence_type_templates set parts = array['full','half','hrs'] where code = 'OČR';
