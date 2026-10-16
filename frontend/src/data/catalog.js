// Medication catalog used by the DDI workspace search and patient forms.
// Generic names match the canonical names used by the backend Drug Knowledge Base
// (app/modules/module2_drug.py), so a lookup here maps 1:1 to an API call.
export const CATALOG = [
  { name: 'Metformin', cls: 'Biguanide (antidiabetic)', brands: ['Glycomet', 'Glucophage', 'Obimet'], dose: '500mg' },
  { name: 'Glimepiride', cls: 'Sulfonylurea (antidiabetic)', brands: ['Amaryl', 'Glimestar'], dose: '2mg' },
  { name: 'Gliclazide', cls: 'Sulfonylurea (antidiabetic)', brands: ['Diamicron', 'Glizid'], dose: '80mg' },
  { name: 'Glipizide', cls: 'Sulfonylurea (antidiabetic)', brands: ['Glynase', 'Minidiab'], dose: '5mg' },
  { name: 'Pioglitazone', cls: 'Thiazolidinedione (antidiabetic)', brands: ['Pioz', 'Actos'], dose: '15mg' },
  { name: 'Sitagliptin', cls: 'DPP-4 inhibitor (antidiabetic)', brands: ['Januvia', 'Istavel'], dose: '100mg' },
  { name: 'Vildagliptin', cls: 'DPP-4 inhibitor (antidiabetic)', brands: ['Galvus', 'Jalra'], dose: '50mg' },
  { name: 'Linagliptin', cls: 'DPP-4 inhibitor (antidiabetic)', brands: ['Trajenta'], dose: '5mg' },
  { name: 'Empagliflozin', cls: 'SGLT2 inhibitor (antidiabetic)', brands: ['Jardiance'], dose: '10mg' },
  { name: 'Dapagliflozin', cls: 'SGLT2 inhibitor (antidiabetic)', brands: ['Forxiga', 'Farxiga'], dose: '10mg' },
  { name: 'Insulin Glargine', cls: 'Basal insulin', brands: ['Lantus', 'Basalog', 'Toujeo'], dose: '10 units' },
  { name: 'Insulin Regular', cls: 'Short-acting insulin', brands: ['Actrapid', 'Humulin R'], dose: '10 units' },
  { name: 'Atorvastatin', cls: 'Statin', brands: ['Lipitor', 'Atorva', 'Storvas'], dose: '10mg' },
  { name: 'Rosuvastatin', cls: 'Statin', brands: ['Crestor', 'Rosuvas'], dose: '10mg' },
  { name: 'Simvastatin', cls: 'Statin', brands: ['Zocor', 'Simvotin'], dose: '20mg' },
  { name: 'Fenofibrate', cls: 'Fibrate', brands: ['Lipicard', 'Fenolip'], dose: '160mg' },
  { name: 'Ezetimibe', cls: 'Cholesterol absorption inhibitor', brands: ['Zetia', 'Ezedoc'], dose: '10mg' },
  { name: 'Amlodipine', cls: 'Calcium channel blocker', brands: ['Amlopress', 'Norvasc', 'Amlong'], dose: '5mg' },
  { name: 'Nifedipine', cls: 'Calcium channel blocker', brands: ['Adalat', 'Depin'], dose: '10mg' },
  { name: 'Diltiazem', cls: 'Calcium channel blocker', brands: ['Cardizem', 'Dilzem'], dose: '60mg' },
  { name: 'Verapamil', cls: 'Calcium channel blocker', brands: ['Calaptin', 'Isoptin'], dose: '80mg' },
  { name: 'Losartan', cls: 'ARB', brands: ['Losar', 'Cozaar', 'Repace'], dose: '50mg' },
  { name: 'Telmisartan', cls: 'ARB', brands: ['Telma', 'Micardis'], dose: '40mg' },
  { name: 'Valsartan', cls: 'ARB', brands: ['Diovan', 'Valzaar'], dose: '80mg' },
  { name: 'Olmesartan', cls: 'ARB', brands: ['Olmezest', 'Benicar'], dose: '20mg' },
  { name: 'Irbesartan', cls: 'ARB', brands: ['Avapro', 'Irovel'], dose: '150mg' },
  { name: 'Enalapril', cls: 'ACE inhibitor', brands: ['Envas', 'Vasotec'], dose: '5mg' },
  { name: 'Ramipril', cls: 'ACE inhibitor', brands: ['Cardace', 'Altace'], dose: '5mg' },
  { name: 'Lisinopril', cls: 'ACE inhibitor', brands: ['Listril', 'Zestril'], dose: '10mg' },
  { name: 'Perindopril', cls: 'ACE inhibitor', brands: ['Coversyl'], dose: '4mg' },
  { name: 'Atenolol', cls: 'Beta blocker', brands: ['Tenormin', 'Aten'], dose: '50mg' },
  { name: 'Metoprolol', cls: 'Beta blocker', brands: ['Metolar', 'Betaloc', 'Lopressor'], dose: '50mg' },
  { name: 'Bisoprolol', cls: 'Beta blocker', brands: ['Concor', 'Bisoheart'], dose: '5mg' },
  { name: 'Carvedilol', cls: 'Beta blocker', brands: ['Carca', 'Coreg'], dose: '6.25mg' },
  { name: 'Propranolol', cls: 'Beta blocker', brands: ['Inderal', 'Ciplar'], dose: '40mg' },
  { name: 'Nebivolol', cls: 'Beta blocker', brands: ['Nebicard', 'Nebilet'], dose: '5mg' },
  { name: 'Hydrochlorothiazide', cls: 'Thiazide diuretic', brands: ['Aquazide', 'Esidrex'], dose: '12.5mg' },
  { name: 'Chlorthalidone', cls: 'Thiazide-like diuretic', brands: ['Thalitone', 'Hydrazide'], dose: '12.5mg' },
  { name: 'Furosemide', cls: 'Loop diuretic', brands: ['Lasix', 'Frusenex'], dose: '40mg' },
  { name: 'Torsemide', cls: 'Loop diuretic', brands: ['Dytor', 'Demadex'], dose: '10mg' },
  { name: 'Spironolactone', cls: 'Potassium-sparing diuretic', brands: ['Aldactone', 'Spiromide'], dose: '25mg' },
  { name: 'Clonidine', cls: 'Alpha-2 agonist', brands: ['Catapres', 'Arkamin'], dose: '0.1mg' },
  { name: 'Hydralazine', cls: 'Vasodilator', brands: ['Apresoline'], dose: '25mg' },
  { name: 'Isosorbide Mononitrate', cls: 'Nitrate', brands: ['Monotrate', 'Ismo'], dose: '20mg' },
  { name: 'Isosorbide Dinitrate', cls: 'Nitrate', brands: ['Sorbitrate', 'Isordil'], dose: '10mg' },
  { name: 'Nitroglycerin', cls: 'Nitrate', brands: ['Nitrocontin', 'Angispan'], dose: '2.6mg' },
  { name: 'Ranolazine', cls: 'Antianginal', brands: ['Ranexa', 'Rancad'], dose: '500mg' },
  { name: 'Digoxin', cls: 'Cardiac glycoside', brands: ['Lanoxin', 'Digoxin'], dose: '0.25mg' },
  { name: 'Amiodarone', cls: 'Antiarrhythmic', brands: ['Cordarone', 'Tachyra'], dose: '200mg' },
  { name: 'Sacubitril/Valsartan', cls: 'ARNI (heart failure)', brands: ['Entresto', 'Vymada'], dose: '50mg' },
  { name: 'Warfarin', cls: 'Anticoagulant', brands: ['Warf', 'Coumadin'], dose: '3mg' },
  { name: 'Rivaroxaban', cls: 'Anticoagulant (DOAC)', brands: ['Xarelto', 'Rivaflo'], dose: '20mg' },
  { name: 'Apixaban', cls: 'Anticoagulant (DOAC)', brands: ['Eliquis', 'Apigat'], dose: '5mg' },
  { name: 'Dabigatran', cls: 'Anticoagulant (DOAC)', brands: ['Pradaxa'], dose: '110mg' },
  { name: 'Aspirin', cls: 'Antiplatelet / NSAID', brands: ['Ecosprin', 'Disprin', 'Loprin'], dose: '75mg' },
  { name: 'Clopidogrel', cls: 'Antiplatelet', brands: ['Clopilet', 'Plavix', 'Deplatt'], dose: '75mg' },
  { name: 'Ticagrelor', cls: 'Antiplatelet', brands: ['Brilinta', 'Ticagrel'], dose: '90mg' },
  { name: 'Prasugrel', cls: 'Antiplatelet', brands: ['Effient', 'Prasita'], dose: '10mg' },
  { name: 'Omeprazole', cls: 'Proton pump inhibitor', brands: ['Omez', 'Prilosec', 'Ocid'], dose: '20mg' },
  { name: 'Pantoprazole', cls: 'Proton pump inhibitor', brands: ['Pan', 'Pantocid', 'Pantop'], dose: '40mg' },
  { name: 'Esomeprazole', cls: 'Proton pump inhibitor', brands: ['Nexium', 'Raciper'], dose: '40mg' },
  { name: 'Rabeprazole', cls: 'Proton pump inhibitor', brands: ['Razo', 'Rablet'], dose: '20mg' },
  { name: 'Lansoprazole', cls: 'Proton pump inhibitor', brands: ['Lanzol', 'Prevacid'], dose: '30mg' },
  { name: 'Ranitidine', cls: 'H2 blocker', brands: ['Zinetac', 'Aciloc'], dose: '150mg' },
  { name: 'Famotidine', cls: 'H2 blocker', brands: ['Pepcid', 'Famocid'], dose: '20mg' },
  { name: 'Domperidone', cls: 'Prokinetic / antiemetic', brands: ['Domstal', 'Motilium'], dose: '10mg' },
  { name: 'Ondansetron', cls: 'Antiemetic', brands: ['Zofran', 'Emeset', 'Ondem'], dose: '4mg' },
  { name: 'Metoclopramide', cls: 'Prokinetic / antiemetic', brands: ['Perinorm', 'Reglan'], dose: '10mg' },
  { name: 'Levosulpiride', cls: 'Prokinetic', brands: ['Levopraid', 'Lupisulpi'], dose: '75mg' },
  { name: 'Loperamide', cls: 'Antidiarrheal', brands: ['Imodium', 'Eldoper'], dose: '2mg' },
  { name: 'Lactulose', cls: 'Osmotic laxative', brands: ['Duphalac', 'Looz'], dose: '15ml' },
  { name: 'Bisacodyl', cls: 'Stimulant laxative', brands: ['Dulcolax'], dose: '5mg' },
  { name: 'Paracetamol', cls: 'Analgesic / antipyretic', brands: ['Crocin', 'Calpol', 'Dolo'], dose: '500mg' },
  { name: 'Ibuprofen', cls: 'NSAID', brands: ['Brufen', 'Combiflam', 'Advil'], dose: '400mg' },
  { name: 'Diclofenac', cls: 'NSAID', brands: ['Voveran', 'Voltaren', 'Dynapar'], dose: '50mg' },
  { name: 'Naproxen', cls: 'NSAID', brands: ['Naprosyn', 'Naxdom'], dose: '250mg' },
  { name: 'Etoricoxib', cls: 'COX-2 inhibitor (NSAID)', brands: ['Arcoxia', 'Nucoxia'], dose: '90mg' },
  { name: 'Aceclofenac', cls: 'NSAID', brands: ['Zerodol', 'Hifenac'], dose: '100mg' },
  { name: 'Celecoxib', cls: 'COX-2 inhibitor (NSAID)', brands: ['Celebrex', 'Celact'], dose: '200mg' },
  { name: 'Tramadol', cls: 'Opioid analgesic', brands: ['Ultram', 'Tramazac'], dose: '50mg' },
  { name: 'Morphine', cls: 'Opioid analgesic', brands: ['MS Contin', 'Morcontin'], dose: '10mg' },
  { name: 'Tizanidine', cls: 'Muscle relaxant', brands: ['Sirdalud', 'Tizan'], dose: '2mg' },
  { name: 'Thiocolchicoside', cls: 'Muscle relaxant', brands: ['Muscoril', 'Thiocol'], dose: '4mg' },
  { name: 'Amoxicillin', cls: 'Penicillin antibiotic', brands: ['Mox', 'Amoxil'], dose: '500mg' },
  { name: 'Amoxicillin/Clavulanate', cls: 'Penicillin antibiotic', brands: ['Augmentin', 'Clavam'], dose: '625mg' },
  { name: 'Azithromycin', cls: 'Macrolide antibiotic', brands: ['Zithromax', 'Azee', 'Azithral'], dose: '500mg' },
  { name: 'Clarithromycin', cls: 'Macrolide antibiotic', brands: ['Klacid', 'Claribid'], dose: '500mg' },
  { name: 'Erythromycin', cls: 'Macrolide antibiotic', brands: ['Erythrocin', 'Althrocin'], dose: '250mg' },
  { name: 'Ciprofloxacin', cls: 'Fluoroquinolone antibiotic', brands: ['Ciplox', 'Cifran'], dose: '500mg' },
  { name: 'Levofloxacin', cls: 'Fluoroquinolone antibiotic', brands: ['Levaquin', 'Tavanic', 'Levomac'], dose: '500mg' },
  { name: 'Ofloxacin', cls: 'Fluoroquinolone antibiotic', brands: ['Zanocin', 'Oflox'], dose: '200mg' },
  { name: 'Cefixime', cls: 'Cephalosporin antibiotic', brands: ['Taxim-O', 'Suprax', 'Zifi'], dose: '200mg' },
  { name: 'Cefuroxime', cls: 'Cephalosporin antibiotic', brands: ['Zinnat', 'Ceftum'], dose: '500mg' },
  { name: 'Cephalexin', cls: 'Cephalosporin antibiotic', brands: ['Keflex', 'Sporidex'], dose: '500mg' },
  { name: 'Ceftriaxone', cls: 'Cephalosporin antibiotic', brands: ['Rocephin', 'Monocef'], dose: '1g' },
  { name: 'Doxycycline', cls: 'Tetracycline antibiotic', brands: ['Vibramycin', 'Doxy-1'], dose: '100mg' },
  { name: 'Metronidazole', cls: 'Nitroimidazole antibiotic', brands: ['Flagyl', 'Metrogyl'], dose: '400mg' },
  { name: 'Nitrofurantoin', cls: 'Urinary antibiotic', brands: ['Macrobid', 'Furadantin'], dose: '100mg' },
  { name: 'Trimethoprim/Sulfamethoxazole', cls: 'Sulfonamide antibiotic', brands: ['Bactrim', 'Septran'], dose: '800mg' },
  { name: 'Clindamycin', cls: 'Lincosamide antibiotic', brands: ['Cleocin', 'Dalacin C'], dose: '300mg' },
  { name: 'Linezolid', cls: 'Oxazolidinone antibiotic', brands: ['Zyvox', 'Linospan'], dose: '600mg' },
  { name: 'Rifampicin', cls: 'Anti-tubercular', brands: ['Rifadin', 'R-Cinex'], dose: '450mg' },
  { name: 'Isoniazid', cls: 'Anti-tubercular', brands: ['Nydrazid', 'Inah'], dose: '300mg' },
  { name: 'Fluconazole', cls: 'Antifungal', brands: ['Diflucan', 'Zocon'], dose: '150mg' },
  { name: 'Itraconazole', cls: 'Antifungal', brands: ['Sporanox', 'Itaspor'], dose: '100mg' },
  { name: 'Terbinafine', cls: 'Antifungal', brands: ['Lamisil', 'Terbicip'], dose: '250mg' },
  { name: 'Acyclovir', cls: 'Antiviral', brands: ['Zovirax', 'Acivir'], dose: '400mg' },
  { name: 'Oseltamivir', cls: 'Antiviral', brands: ['Tamiflu', 'Antiflu'], dose: '75mg' },
  { name: 'Ivermectin', cls: 'Antiparasitic', brands: ['Stromectol', 'Ivecop'], dose: '12mg' },
  { name: 'Albendazole', cls: 'Anthelmintic', brands: ['Zentel', 'Bandy'], dose: '400mg' },
  { name: 'Hydroxychloroquine', cls: 'Antimalarial / DMARD', brands: ['Plaquenil', 'HCQS'], dose: '200mg' },
  { name: 'Cetirizine', cls: 'Antihistamine', brands: ['Zyrtec', 'Okacet', 'Alerid'], dose: '10mg' },
  { name: 'Levocetirizine', cls: 'Antihistamine', brands: ['Xyzal', 'Levocet'], dose: '5mg' },
  { name: 'Loratadine', cls: 'Antihistamine', brands: ['Claritin', 'Lorfast'], dose: '10mg' },
  { name: 'Fexofenadine', cls: 'Antihistamine', brands: ['Allegra', 'Fexova'], dose: '120mg' },
  { name: 'Chlorpheniramine', cls: 'Antihistamine', brands: ['Piriton', 'Cetzine'], dose: '4mg' },
  { name: 'Montelukast', cls: 'Leukotriene antagonist', brands: ['Singulair', 'Montair'], dose: '10mg' },
  { name: 'Salbutamol', cls: 'Bronchodilator (SABA)', brands: ['Ventolin', 'Asthalin'], dose: '2mg' },
  { name: 'Formoterol/Budesonide', cls: 'Inhaled corticosteroid + LABA', brands: ['Symbicort', 'Foracort'], dose: '200mcg' },
  { name: 'Theophylline', cls: 'Bronchodilator', brands: ['Theo-Asthalin', 'Deriphyllin'], dose: '200mg' },
  { name: 'Prednisolone', cls: 'Corticosteroid', brands: ['Wysolone', 'Omnacortil'], dose: '10mg' },
  { name: 'Prednisone', cls: 'Corticosteroid', brands: ['Deltasone', 'Rayos'], dose: '10mg' },
  { name: 'Methylprednisolone', cls: 'Corticosteroid', brands: ['Medrol', 'Solu-Medrol'], dose: '16mg' },
  { name: 'Dexamethasone', cls: 'Corticosteroid', brands: ['Decadron', 'Dexona'], dose: '4mg' },
  { name: 'Hydrocortisone', cls: 'Corticosteroid', brands: ['Cortef', 'Efcorlin'], dose: '10mg' },
  { name: 'Levothyroxine', cls: 'Thyroid hormone', brands: ['Eltroxin', 'Thyronorm', 'Synthroid'], dose: '50mcg' },
  { name: 'Carbimazole', cls: 'Antithyroid', brands: ['Neomercazole', 'Thyrocab'], dose: '10mg' },
  { name: 'Methimazole', cls: 'Antithyroid', brands: ['Tapazole'], dose: '5mg' },
  { name: 'Alendronate', cls: 'Bisphosphonate', brands: ['Fosamax', 'Osteofos'], dose: '70mg' },
  { name: 'Calcium Carbonate', cls: 'Mineral supplement', brands: ['Shelcal', 'Calcimax'], dose: '500mg' },
  { name: 'Cholecalciferol', cls: 'Vitamin D3', brands: ['Calcirol', 'D-Rise', 'Uprise-D3'], dose: '60000 IU' },
  { name: 'Folic Acid', cls: 'Vitamin B9', brands: ['Folvite', 'Folinext'], dose: '5mg' },
  { name: 'Cyanocobalamin', cls: 'Vitamin B12', brands: ['Neurobion', 'Nervijen'], dose: '1500mcg' },
  { name: 'Ferrous Sulfate', cls: 'Iron supplement', brands: ['Feronia', 'Fefol'], dose: '200mg' },
  { name: 'Potassium Chloride', cls: 'Electrolyte supplement', brands: ['Kalium', 'Slow-K'], dose: '600mg' },
  { name: 'Sertraline', cls: 'SSRI', brands: ['Zoloft', 'Serta', 'Daxid'], dose: '50mg' },
  { name: 'Escitalopram', cls: 'SSRI', brands: ['Lexapro', 'Nexito', 'Cipralex'], dose: '10mg' },
  { name: 'Fluoxetine', cls: 'SSRI', brands: ['Prozac', 'Flunil', 'Fludac'], dose: '20mg' },
  { name: 'Paroxetine', cls: 'SSRI', brands: ['Paxil', 'Pexep'], dose: '20mg' },
  { name: 'Citalopram', cls: 'SSRI', brands: ['Celexa', 'Cipram'], dose: '20mg' },
  { name: 'Venlafaxine', cls: 'SNRI', brands: ['Effexor', 'Venlor'], dose: '75mg' },
  { name: 'Duloxetine', cls: 'SNRI', brands: ['Cymbalta', 'Duzela'], dose: '30mg' },
  { name: 'Amitriptyline', cls: 'Tricyclic antidepressant', brands: ['Tryptomer', 'Elavil'], dose: '25mg' },
  { name: 'Nortriptyline', cls: 'Tricyclic antidepressant', brands: ['Sensival', 'Pamelor'], dose: '25mg' },
  { name: 'Mirtazapine', cls: 'Atypical antidepressant', brands: ['Remeron', 'Mirtaz'], dose: '15mg' },
  { name: 'Bupropion', cls: 'Atypical antidepressant', brands: ['Wellbutrin', 'Zyban'], dose: '150mg' },
  { name: 'Alprazolam', cls: 'Benzodiazepine', brands: ['Xanax', 'Alprax', 'Restyl'], dose: '0.5mg' },
  { name: 'Clonazepam', cls: 'Benzodiazepine', brands: ['Klonopin', 'Rivotril', 'Clonotril'], dose: '0.5mg' },
  { name: 'Diazepam', cls: 'Benzodiazepine', brands: ['Valium', 'Calmpose'], dose: '5mg' },
  { name: 'Lorazepam', cls: 'Benzodiazepine', brands: ['Ativan', 'Lorazep'], dose: '1mg' },
  { name: 'Zolpidem', cls: 'Sedative-hypnotic', brands: ['Ambien', 'Zolfresh'], dose: '10mg' },
  { name: 'Melatonin', cls: 'Sleep aid', brands: ['Circadin', 'Meloset'], dose: '3mg' },
  { name: 'Quetiapine', cls: 'Atypical antipsychotic', brands: ['Seroquel', 'Qutan'], dose: '50mg' },
  { name: 'Olanzapine', cls: 'Atypical antipsychotic', brands: ['Zyprexa', 'Oleanz'], dose: '10mg' },
  { name: 'Risperidone', cls: 'Atypical antipsychotic', brands: ['Risperdal', 'Sizodon'], dose: '2mg' },
  { name: 'Aripiprazole', cls: 'Atypical antipsychotic', brands: ['Abilify', 'Arip'], dose: '10mg' },
  { name: 'Haloperidol', cls: 'Typical antipsychotic', brands: ['Haldol', 'Serenace'], dose: '5mg' },
  { name: 'Lithium', cls: 'Mood stabilizer', brands: ['Lithosun', 'Eskalith'], dose: '300mg' },
  { name: 'Valproate', cls: 'Anticonvulsant / mood stabilizer', brands: ['Depakote', 'Encorate', 'Valparin'], dose: '500mg' },
  { name: 'Carbamazepine', cls: 'Anticonvulsant', brands: ['Tegretol', 'Zen'], dose: '200mg' },
  { name: 'Phenytoin', cls: 'Anticonvulsant', brands: ['Dilantin', 'Eptoin'], dose: '100mg' },
  { name: 'Levetiracetam', cls: 'Anticonvulsant', brands: ['Keppra', 'Levipil'], dose: '500mg' },
  { name: 'Lamotrigine', cls: 'Anticonvulsant', brands: ['Lamictal', 'Lamitor'], dose: '100mg' },
  { name: 'Topiramate', cls: 'Anticonvulsant', brands: ['Topamax', 'Topirol'], dose: '50mg' },
  { name: 'Gabapentin', cls: 'Anticonvulsant / neuropathic pain', brands: ['Neurontin', 'Gabapin'], dose: '300mg' },
  { name: 'Pregabalin', cls: 'Neuropathic pain', brands: ['Lyrica', 'Pregabid'], dose: '75mg' },
  { name: 'Donepezil', cls: 'Cholinesterase inhibitor', brands: ['Aricept', 'Donep'], dose: '5mg' },
  { name: 'Levodopa/Carbidopa', cls: 'Antiparkinsonian', brands: ['Sinemet', 'Syndopa'], dose: '110mg' },
  { name: 'Sumatriptan', cls: 'Triptan (migraine)', brands: ['Imitrex', 'Suminat'], dose: '50mg' },
  { name: 'Flunarizine', cls: 'Migraine prophylaxis', brands: ['Sibelium', 'Flunarin'], dose: '10mg' },
  { name: 'Betahistine', cls: 'Vertigo agent', brands: ['Vertin', 'Serc'], dose: '16mg' },
  { name: 'Sildenafil', cls: 'PDE5 inhibitor', brands: ['Viagra', 'Suhagra', 'Revatio'], dose: '50mg' },
  { name: 'Tadalafil', cls: 'PDE5 inhibitor', brands: ['Cialis', 'Tadacip'], dose: '10mg' },
  { name: 'Tamsulosin', cls: 'Alpha blocker (BPH)', brands: ['Flomax', 'Urimax', 'Veltam'], dose: '0.4mg' },
  { name: 'Finasteride', cls: '5-alpha reductase inhibitor', brands: ['Proscar', 'Finpecia'], dose: '5mg' },
  { name: 'Allopurinol', cls: 'Xanthine oxidase inhibitor', brands: ['Zyloric', 'Zyloprim'], dose: '100mg' },
  { name: 'Febuxostat', cls: 'Xanthine oxidase inhibitor', brands: ['Uloric', 'Febugood'], dose: '40mg' },
  { name: 'Colchicine', cls: 'Gout agent', brands: ['Colcrys', 'Zycolchin'], dose: '0.5mg' },
  { name: 'Methotrexate', cls: 'DMARD / antimetabolite', brands: ['Folitrax', 'Trexall'], dose: '7.5mg' },
  { name: 'Tamoxifen', cls: 'Anti-estrogen (oncology)', brands: ['Nolvadex', 'Tamoxifen'], dose: '20mg' },
  { name: 'Cyclosporine', cls: 'Immunosuppressant', brands: ['Sandimmune', 'Neoral'], dose: '100mg' },
  { name: 'Tacrolimus', cls: 'Immunosuppressant', brands: ['Prograf', 'Pangraf'], dose: '1mg' },
  { name: 'Oral Rehydration Salts', cls: 'Rehydration', brands: ['ORS', 'Electral'], dose: '1 sachet' },
];

export const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'At night', 'As needed'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const COMMON_CONDITIONS = [
  'Hypertension', 'Type 2 Diabetes', 'Hyperlipidemia', 'GERD', 'Atrial Fibrillation',
  'Coronary Artery Disease', 'Osteoarthritis', 'Depression', 'Heart Failure', 'Chronic Kidney Disease',
];

export const COMMON_ALLERGENS = [
  'Penicillin', 'Sulfa drugs', 'Aspirin', 'Ibuprofen (NSAIDs)', 'Latex', 'Peanuts', 'Iodine / contrast dye', 'Eggs', 'Shellfish',
];

// Short, doctor-editable starting phrases for free-text consultation fields — clicking
// one appends it rather than replacing what's already been typed.
export const DIAGNOSIS_SUGGESTIONS = [
  'Upper respiratory tract infection', 'Hypertension, uncontrolled', 'Type 2 Diabetes Mellitus',
  'Acute gastroenteritis', 'Viral fever', 'Migraine', 'Urinary tract infection', 'Acid reflux (GERD)',
];
export const FINDINGS_SUGGESTIONS = [
  'Afebrile, vitals stable', 'Mild tenderness on palpation', 'Chest clear on auscultation',
  'Throat mildly inflamed', 'No signs of distress', 'BP elevated on repeat measurement',
];
export const FOLLOWUP_SUGGESTIONS = [
  'Review in 7 days', 'Review in 2 weeks', 'Return if symptoms worsen', 'Repeat blood work before next visit',
  'Continue current medications', 'Refer to specialist if no improvement',
];

export const ASSESSMENT_SUGGESTIONS = [
  'Mild condition, patient stable', 'Moderate severity, needs treatment', 'Responding well to treatment',
  'No complications noted', 'Condition not improving, needs review', 'Chronic condition, well controlled',
  'Chronic condition, poorly controlled', 'Reduced kidney function — dose adjustment considered',
  'Reduced liver function — drug choice reviewed', 'Allergy history reviewed before prescribing',
];

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 /]+/g, ' ').replace(/\s+/g, ' ').trim();

export function findDrug(name) {
  const q = norm(name);
  if (!q) return undefined;
  return CATALOG.find((d) => norm(d.name) === q || d.brands.some((b) => norm(b) === q));
}

// Ranked catalog search used by the prescription medicine picker. Returns
// [{ drug, via }] where `via` is the brand/class text that matched (if the
// match wasn't on the generic name), best matches first:
//   exact generic > generic starts-with > exact brand > brand starts-with >
//   word-start match > substring (generic/brand) > therapeutic class > typo-tolerant.
export function searchCatalog(query, limit = 12) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const drug of CATALOG) {
    const n = norm(drug.name);
    let score = 0; let via = null;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 90;
    else {
      const brand = drug.brands.find((b) => norm(b) === q);
      const brandPre = drug.brands.find((b) => norm(b).startsWith(q));
      if (brand) { score = 85; via = brand; }
      else if (brandPre) { score = 80; via = brandPre; }
      else if (n.split(/[ /]/).some((w) => w.startsWith(q))) score = 70;
      else if (n.includes(q)) score = 60;
      else {
        const brandSub = drug.brands.find((b) => norm(b).includes(q));
        if (brandSub) { score = 55; via = brandSub; }
        else if (q.length >= 3 && norm(drug.cls).includes(q)) { score = 40; via = drug.cls; }
        else if (q.length >= 4 && isTypo(q, n)) score = 30;
      }
    }
    if (score) scored.push({ drug, via, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.drug.name.localeCompare(b.drug.name))
    .slice(0, limit)
    .map(({ drug, via }) => ({ drug, via }));
}

// Tolerates one-edit typos ("metformn", "amlodipne") against the start of a name.
function isTypo(q, name) {
  const head = name.slice(0, q.length + 1);
  const dist = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
  };
  return Math.min(dist(q, name.slice(0, q.length)), dist(q, head)) <= 1;
}

// "500mg" / "10 units" / "0.25mg" -> { num: '500', unit: 'mg' }
export function splitDose(dose) {
  const m = /^\s*([\d.]+)\s*(.*)$/.exec(dose || '');
  return m ? { num: m[1], unit: m[2].trim() } : { num: '', unit: '' };
}
